import { mkdir, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import { stdin, stderr } from "node:process";
import type { ModelMessage } from "ai";
import { runTurn, TurnBudgetExceededError, type Chunk } from "./agent/loop.ts";
import { setBehaviorConfigOverride } from "./config-file.ts";
import {
  currentModel,
  currentProviderId,
  currentThinking,
  PROVIDERS,
  setModel,
  setProvider,
  setThinking,
  thinkingLevelsFor,
  type ProviderId,
  type ThinkingLevel,
} from "./config.ts";
import { getPricing, getRawUsage, getTotalCost, resetUsage } from "./cost.ts";
import { setConfirmHandler } from "./permissions.ts";
import { matchSkills, getCachedRegistry, loadSkillBody } from "./skills.ts";
import { createSession, saveSession, type Session } from "./session/store.ts";
import { finalizeSnapshots, initSnapshot, nextTurn } from "./session/snapshot.ts";
import { setAnswerHandler } from "./tools/question.ts";
import { CURRENT_VERSION } from "./version.ts";
import { redactText, safeToolKind, safeToolOutcome, safeToolSubject, stableRunId } from "./headless/redact.ts";
import {
  HEADLESS_TRAJECTORY_VERSION,
  type HeadlessOptions,
  type HeadlessOutcome,
  type HeadlessToolEvent,
  type HeadlessTrajectory,
  type HeadlessTreatment,
} from "./headless/types.ts";

const MAX_INSTRUCTION_CHARACTERS = 200_000;
const SYSTEM_AND_TOOLS_TOKEN_RESERVE = 120_000;

export class HeadlessArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeadlessArgumentError";
  }
}

export interface HeadlessDependencies {
  turnRunner?: typeof runTurn;
}

function requiredValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new HeadlessArgumentError(`${flag} requires a value.`);
  return value;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HeadlessArgumentError(`${flag} must be a positive number.`);
  }
  return parsed;
}

export function parseHeadlessArgs(args: readonly string[]): HeadlessOptions {
  let outputJson: string | undefined;
  let promptFile: string | undefined;
  let treatment: HeadlessTreatment = "authoritative";
  let provider = currentProviderId();
  let model = currentModel();
  let thinking = currentThinking();
  let modelExplicit = false;
  let thinkingExplicit = false;
  let maxCostUsd = 0.25;
  let maxOutputTokens = 16_000;
  let timeoutMs = 15 * 60_000;
  let runId: string | undefined;
  let taskId: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--headless") continue;
    const value = requiredValue(args, index, flag);
    index++;
    switch (flag) {
      case "--output-json": outputJson = value; break;
      case "--prompt-file": promptFile = value; break;
      case "--treatment":
        if (value !== "legacy" && value !== "authoritative") {
          throw new HeadlessArgumentError("--treatment must be legacy or authoritative.");
        }
        treatment = value;
        break;
      case "--provider":
        if (!(value in PROVIDERS)) throw new HeadlessArgumentError(`Unknown provider: ${value}.`);
        provider = value as ProviderId;
        if (!modelExplicit) model = PROVIDERS[provider].defaultModel;
        if (!thinkingExplicit) thinking = PROVIDERS[provider].defaultThinking;
        break;
      case "--model": model = value; modelExplicit = true; break;
      case "--thinking": thinking = value as ThinkingLevel; thinkingExplicit = true; break;
      case "--max-cost-usd": maxCostUsd = positiveNumber(value, flag); break;
      case "--max-output-tokens": maxOutputTokens = Math.floor(positiveNumber(value, flag)); break;
      case "--timeout-ms": timeoutMs = Math.floor(positiveNumber(value, flag)); break;
      case "--run-id": runId = value; break;
      case "--task-id": taskId = value; break;
      default: throw new HeadlessArgumentError(`Unknown headless option: ${flag}.`);
    }
  }

  if (!outputJson) throw new HeadlessArgumentError("--output-json is required in headless mode.");
  if (!thinkingLevelsFor(provider, model).includes(thinking)) {
    throw new HeadlessArgumentError(
      `Thinking level ${thinking} is not supported by ${provider}/${model}.`,
    );
  }
  return {
    outputJson,
    treatment,
    provider,
    model,
    thinking,
    maxCostUsd,
    maxOutputTokens,
    timeoutMs,
    ...(promptFile ? { promptFile } : {}),
    ...(runId ? { runId } : {}),
    ...(taskId ? { taskId } : {}),
  };
}

export async function readHeadlessInstruction(options: HeadlessOptions): Promise<string> {
  const instruction = options.promptFile
    ? await readFile(path.resolve(options.promptFile), "utf8")
    : await new Response(stdin).text();
  if (!instruction.trim()) throw new HeadlessArgumentError("Headless instruction is empty.");
  if (instruction.length > MAX_INSTRUCTION_CHARACTERS) {
    throw new HeadlessArgumentError(
      `Headless instruction exceeds ${MAX_INSTRUCTION_CHARACTERS} characters.`,
    );
  }
  return instruction;
}

export function estimatedHeadlessUpperBoundUsd(
  instruction: string,
  options: Pick<HeadlessOptions, "provider" | "model" | "maxOutputTokens" | "treatment">,
): number {
  const pricing = getPricing(options.model, options.provider);
  const mainInputTokens = Math.ceil(instruction.length / 3.5) + SYSTEM_AND_TOOLS_TOKEN_RESERVE;
  const main = (mainInputTokens / 1_000_000) * pricing.inputPer1M +
    (options.maxOutputTokens / 1_000_000) * pricing.outputPer1M;
  if (options.treatment === "legacy") return main;
  const classifierInput = 24_000;
  const classifierOutput = 4_000;
  return main +
    (classifierInput / 1_000_000) * pricing.inputPer1M +
    (classifierOutput / 1_000_000) * pricing.outputPer1M;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, absolute);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function behaviorContext(session: Session) {
  return {
    sessionId: session.meta.id,
    turnNumber: 1,
    selectedSkillNames: [] as string[],
    onPlan: async (snapshot: NonNullable<Session["behavior"]>) => {
      session.behavior = snapshot;
    },
  };
}

export async function collectHeadlessChunks(
  chunks: AsyncGenerator<Chunk>,
  signal?: AbortSignal,
): Promise<{
  finalAnswer: string;
  tools: HeadlessToolEvent[];
  refused: boolean;
}> {
  let finalAnswer = "";
  let sequence = 0;
  let refused = false;
  const tools: HeadlessToolEvent[] = [];
  for await (const chunk of chunks) {
    if (chunk.type === "reasoning") continue;
    if (chunk.type === "text") {
      finalAnswer += chunk.text;
      continue;
    }
    sequence++;
    if (chunk.type === "tool-call") {
      const subject = safeToolSubject(chunk.toolName, chunk.input);
      tools.push({
        sequence,
        type: "tool-call",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        kind: safeToolKind(chunk.toolName, chunk.input),
        ...(subject ? { subject } : {}),
      });
      continue;
    }
    const observed = safeToolOutcome(chunk.output, chunk.isError);
    if (observed.outcome === "refused") refused = true;
    tools.push({
      sequence,
      type: "tool-result",
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      ...observed,
    });
  }
  return { finalAnswer: redactText(finalAnswer), tools, refused: refused || signal?.aborted === true };
}

function exitCodeFor(outcome: HeadlessOutcome): number {
  if (outcome === "completed") return 0;
  if (outcome === "aborted") return 130;
  if (outcome === "refused") return 3;
  if (outcome === "budget-exceeded") return 4;
  return 1;
}

export async function runHeadless(
  options: HeadlessOptions,
  instruction: string,
  dependencies: HeadlessDependencies = {},
): Promise<HeadlessTrajectory> {
  const started = new Date();
  const runId = options.runId ?? stableRunId(
    `${started.toISOString()}\0${process.cwd()}\0${options.taskId ?? ""}\0${instruction}`,
  );
  let outcome: HeadlessOutcome = "failed";
  let finalAnswer = "";
  let tools: HeadlessToolEvent[] = [];
  let matchedSkills: string[] = [];
  let error: HeadlessTrajectory["error"];
  const session = createSession({
    id: runId,
    mode: "build",
    provider: PROVIDERS[options.provider].label,
    model: options.model,
  });

  const previousClassifierModel = process.env.INTERFERENCE_CLASSIFIER_MODEL;
  const previousClassifierThinking = process.env.INTERFERENCE_CLASSIFIER_THINKING;
  resetUsage();
  setProvider(options.provider);
  setModel(options.model);
  setThinking(options.thinking);
  setBehaviorConfigOverride(options.treatment === "legacy"
    ? { engine: "legacy", enforcement: "legacy", diagnostics: false }
    : { engine: "agentic-swe", enforcement: "authoritative", diagnostics: true });
  process.env.INTERFERENCE_CLASSIFIER_MODEL = options.model;
  process.env.INTERFERENCE_CLASSIFIER_THINKING = options.thinking;
  setConfirmHandler(async () => false);
  setAnswerHandler(async (questions) => questions.map(() => []));
  initSnapshot(runId);
  nextTurn();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const estimate = estimatedHeadlessUpperBoundUsd(instruction, options);
    if (estimate > options.maxCostUsd) {
      outcome = "budget-exceeded";
      error = {
        name: "BudgetPreflightError",
        message: `Estimated upper bound $${estimate.toFixed(6)} exceeds per-run cap $${options.maxCostUsd.toFixed(6)}.`,
      };
    } else {
      matchedSkills = matchSkills(instruction, getCachedRegistry());
      const skillBodies = (await Promise.all(matchedSkills.map((name) => loadSkillBody(name))))
        .filter((body): body is string => body !== null);
      const context = behaviorContext(session);
      context.selectedSkillNames.push(...matchedSkills);
      const messages: ModelMessage[] = [{ role: "user", content: instruction }];
      const collected = await collectHeadlessChunks(
        (dependencies.turnRunner ?? runTurn)(
          messages,
          controller.signal,
          "build",
          skillBodies.length ? skillBodies : undefined,
          undefined,
          { provider: options.provider, model: options.model, thinkingLevel: options.thinking },
          undefined,
          context,
          { maxOutputTokens: options.maxOutputTokens, maxCostUsd: options.maxCostUsd },
        ),
        controller.signal,
      );
      finalAnswer = collected.finalAnswer;
      tools = collected.tools;
      outcome = controller.signal.aborted
        ? "aborted"
        : collected.refused
          ? "refused"
          : "completed";
      session.messages = messages;
      session.meta.turnCount = 1;
      session.usage = getRawUsage();
      await finalizeSnapshots();
      await saveSession(session);
    }
  } catch (caught) {
    outcome = controller.signal.aborted
      ? "aborted"
      : caught instanceof TurnBudgetExceededError
        ? "budget-exceeded"
        : "failed";
    error = {
      name: caught instanceof Error ? caught.name : "Error",
      message: redactText(caught instanceof Error ? caught.message : String(caught), 2_000),
    };
  } finally {
    clearTimeout(timer);
    setConfirmHandler(null);
    setAnswerHandler(null);
    setBehaviorConfigOverride(null);
    if (previousClassifierModel === undefined) delete process.env.INTERFERENCE_CLASSIFIER_MODEL;
    else process.env.INTERFERENCE_CLASSIFIER_MODEL = previousClassifierModel;
    if (previousClassifierThinking === undefined) delete process.env.INTERFERENCE_CLASSIFIER_THINKING;
    else process.env.INTERFERENCE_CLASSIFIER_THINKING = previousClassifierThinking;
  }

  const rawUsage = getRawUsage();
  const classifier = session.behavior?.classifier;
  const classifierInputTokens = classifier?.inputTokens ?? 0;
  const classifierOutputTokens = classifier?.outputTokens ?? 0;
  const classifierCostUsd = classifier?.estimatedCostUsd ?? 0;
  const costUsd = getTotalCost() + classifierCostUsd;
  if (costUsd > options.maxCostUsd && outcome === "completed") outcome = "budget-exceeded";
  const finished = new Date();
  const trajectory: HeadlessTrajectory = {
    schemaVersion: HEADLESS_TRAJECTORY_VERSION,
    interferenceVersion: CURRENT_VERSION,
    runId,
    ...(options.taskId ? { taskId: options.taskId } : {}),
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    // The trajectory is portable and must not disclose a local machine path.
    workspace: ".",
    treatment: options.treatment,
    provider: options.provider,
    model: options.model,
    thinking: options.thinking,
    outcome,
    exitCode: exitCodeFor(outcome),
    finalAnswer,
    tools,
    skills: {
      matched: [...matchedSkills],
      agenticSelected: session.behavior?.observedSkills ??
        session.behavior?.plan?.selectedSkills.map((skill) => skill.name) ?? [],
    },
    usage: {
      ...rawUsage,
      input: rawUsage.noCacheInput + rawUsage.cacheRead + rawUsage.cacheWrite,
      costUsd,
      classifierInputTokens,
      classifierOutputTokens,
      classifierCostUsd,
    },
    budget: { maxCostUsd: options.maxCostUsd, exceeded: costUsd > options.maxCostUsd },
    ...(session.behavior ? { behavior: session.behavior } : {}),
    ...(error ? { error } : {}),
  };
  await writeJsonAtomic(options.outputJson, trajectory);
  return trajectory;
}

export async function runHeadlessCli(args: readonly string[]): Promise<number> {
  try {
    const options = parseHeadlessArgs(args);
    const instruction = await readHeadlessInstruction(options);
    const trajectory = await runHeadless(options, instruction);
    return trajectory.exitCode;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    stderr.write(`${JSON.stringify({
      schemaVersion: HEADLESS_TRAJECTORY_VERSION,
      outcome: "failed",
      error: { name: caught instanceof Error ? caught.name : "Error", message: redactText(message) },
      interferenceVersion: CURRENT_VERSION,
    })}\n`);
    return caught instanceof HeadlessArgumentError ? 2 : 1;
  }
}
