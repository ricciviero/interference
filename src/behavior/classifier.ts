import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type {
  AvailableSkill,
  SkillRouter,
  SkillRouterInput,
  TaskClassifier,
  TaskClassifierInput,
} from "@agenticswe/core";
import {
  cheapModelFor,
  currentProviderId,
  currentThinking,
  thinkingLevelsFor,
  type ProviderId,
  type ThinkingLevel,
} from "../config.ts";
import { getPricing } from "../cost.ts";
import { resolveModel } from "../provider.ts";
import type { BehaviorSkillCandidate } from "./skills.ts";
import type { ClassifierTelemetry } from "./types.ts";

const MAX_SUMMARY_CHARACTERS = 8_000;
const CLASSIFIER_MAX_OUTPUT_TOKENS = 2_000;

function classifierModel(provider: ProviderId): string {
  return process.env.INTERFERENCE_CLASSIFIER_MODEL?.trim() || cheapModelFor(provider);
}

function classifierThinking(provider: ProviderId, model: string): ThinkingLevel {
  const requested = process.env.INTERFERENCE_CLASSIFIER_THINKING?.trim() as ThinkingLevel | undefined;
  if (requested && thinkingLevelsFor(provider, model).includes(requested)) return requested;
  return model === process.env.INTERFERENCE_MODEL ? currentThinking() : "low";
}

const classificationSchema = z.object({
  value: z.enum(["trivial", "non-trivial", "uncertain"]),
  reasons: z.array(z.string().min(1)).min(1).max(5),
  confidence: z.number().min(0).max(1),
  trivialCriteria: z.object({
    localized: z.boolean(),
    mechanicallyClear: z.boolean(),
    noBehaviorOrContractChange: z.boolean(),
    noSequencingDecision: z.boolean(),
  }),
  selectedSkills: z.array(z.string().min(1)).max(5),
  /** False restricts the host to read-only behavior; true never grants permission by itself. */
  mutationRequested: z.boolean().optional(),
  explicitOnboarding: z.boolean().optional(),
  explicitLighterProcess: z.boolean().optional(),
  lighterProcessReason: z.string().min(1).optional(),
});

type ClassificationOutput = z.infer<typeof classificationSchema>;
type ClassifierFixtureOutput = Omit<ClassificationOutput, "trivialCriteria"> & {
  trivialCriteria?: ClassificationOutput["trivialCriteria"];
};

export function normalizeModelClassification(
  output: ClassificationOutput,
  summary = "",
): ClassificationOutput {
  const criteria = Object.values(output.trivialCriteria);
  const deterministicReasons = deterministicNonTrivialReasons(summary);
  if (
    output.value !== "trivial" ||
    (criteria.every(Boolean) && deterministicReasons.length === 0)
  ) return output;
  return {
    ...output,
    value: "non-trivial",
    reasons: [
      ...output.reasons,
      criteria.every(Boolean)
        ? deterministicReasons[0]!
        : "Trivial classification rejected because not all normative criteria were satisfied.",
    ].slice(0, 5),
  };
}

function deterministicNonTrivialReasons(summary: string): string[] {
  const normalized = summary.toLowerCase();
  const reasons: string[] = [];
  if (/\b(refactor|migrat(?:e|ion)|deploy|security|secure)\b/.test(normalized)) {
    reasons.push("The request contains a protocol-defined refactor, migration, deployment, or security signal.");
  }
  if (
    /\b(add|create|implement|change|remove|rename|update)\b[^.!?\n]{0,100}\b(export|api|endpoint|route|schema|migration|feature|behavior|contract|command|model|provider)\b/.test(normalized)
  ) {
    reasons.push("The request explicitly changes a behavior or contract surface.");
  }
  const actionMatches = normalized.match(
    /\b(add|create|implement|change|remove|rename|refactor|migrate|deploy|validate|test|document|update|fix)\b/g,
  ) ?? [];
  if (actionMatches.length >= 2) {
    reasons.push("The request contains multiple independently verifiable actions.");
  }
  return reasons;
}

function routedSkillNames(output: ClassifierFixtureOutput): string[] {
  const selected = new Set(output.selectedSkills);
  // Agentic SWE 0.1.0 still represents gate skills as router relevance. Keep
  // the host compatible while deriving mandatory workflow routing from the
  // deterministic classification/gate inputs, never from model preference.
  if (output.explicitOnboarding) selected.add("agents-setup");
  if ((output.mutationRequested ?? true) && output.value !== "trivial") {
    selected.add("agents-setup");
    selected.add("iterations-planner");
  }
  return [...selected];
}

function estimateCost(
  provider: ProviderId,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getPricing(model, provider);
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

/** One bounded structured call supplies both the TaskClassifier and SkillRouter ports. */
export class ModelBehaviorClassifier implements TaskClassifier, SkillRouter {
  readonly #skills: readonly BehaviorSkillCandidate[];
  readonly #telemetry = new Map<string, ClassifierTelemetry>();
  readonly #selectedSkills = new Map<string, string[]>();
  readonly #requestSignals = new Map<
    string,
    {
      explicitOnboarding: boolean;
      explicitLighterProcess: boolean;
      lighterProcessReason?: string;
      mutationRequested: boolean;
    }
  >();

  constructor(skills: readonly BehaviorSkillCandidate[]) {
    this.#skills = skills;
  }

  async classify(input: TaskClassifierInput, signal?: AbortSignal): Promise<unknown> {
    const provider = currentProviderId();
    const model = classifierModel(provider);
    const thinkingLevel = classifierThinking(provider, model);
    const summary = input.summary.slice(0, MAX_SUMMARY_CHARACTERS);
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let attempts = 0;

    try {
      const resolvedModel = await resolveModel({ provider, model, thinkingLevel });
      const request = {
        model: resolvedModel,
        abortSignal: signal,
        maxRetries: 1,
        temperature: 0,
        // DeepSeek max reasoning can spend most of a small ceiling on hidden
        // reasoning before emitting the JSON object. Keep enough room for the
        // bounded structured answer so a valid classification is not truncated.
        maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
        output: Output.object({ schema: classificationSchema }),
        system:
          "Classify a software-engineering request for a workflow engine. " +
          "Trivial requires all of: localized, mechanically clear, no behavior or contract change, " +
          "and no sequencing decision. Non-trivial applies when any of these holds: multiple " +
          "deliverables, cross-layer behavior, migration, refactor, deployment, security, unclear " +
          "scope, or trade-offs. Fill every trivialCriteria boolean independently; the host accepts " +
          "trivial only when all four are true. Use uncertain when evidence is insufficient. Select only skill " +
          "names from the supplied approved catalog. Set mutationRequested=false for questions, " +
          "explanations, reviews, status checks, and any request that explicitly says not to change " +
          "files or call tools. Set it true only when the user asks to create, change, fix, migrate, " +
          "deploy, or otherwise mutate something. Return structured data only.",
        prompt: JSON.stringify({
          request: summary,
          approvedSkills: this.#skills.map(({ name, description }) => ({ name, description })),
        }),
      } as const;
      let result: Awaited<ReturnType<typeof generateText>> | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        attempts = attempt;
        try {
          result = await generateText(request);
          break;
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error) && error.usage) {
            inputTokens += error.usage.inputTokens ?? 0;
            outputTokens += error.usage.outputTokens ?? 0;
          }
          if (attempt < 2 && NoObjectGeneratedError.isInstance(error) && !signal?.aborted) {
            continue;
          }
          throw error;
        }
      }
      if (!result) throw new Error("Classifier did not produce a result.");
      const output = normalizeModelClassification(result.output, summary);
      inputTokens += result.usage.inputTokens ?? 0;
      outputTokens += result.usage.outputTokens ?? 0;
      this.#selectedSkills.set(input.requestId, routedSkillNames(output));
      this.#requestSignals.set(input.requestId, {
        explicitOnboarding: output.explicitOnboarding ?? false,
        explicitLighterProcess: output.explicitLighterProcess ?? false,
        mutationRequested: output.mutationRequested ?? true,
        ...(output.lighterProcessReason
          ? { lighterProcessReason: output.lighterProcessReason }
          : {}),
      });
      this.#telemetry.set(input.requestId, {
        requestId: input.requestId,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCost(provider, model, inputTokens, outputTokens),
        summaryCharacters: summary.length,
        truncated: summary.length !== input.summary.length,
        attempts,
        outcome: "success",
      });
      return output;
    } catch (error) {
      const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
      this.#telemetry.set(input.requestId, {
        requestId: input.requestId,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCost(provider, model, inputTokens, outputTokens),
        summaryCharacters: summary.length,
        truncated: summary.length !== input.summary.length,
        attempts,
        outcome: aborted ? "aborted" : "error",
      });
      throw error;
    }
  }

  async select(
    input: SkillRouterInput,
    candidates: readonly AvailableSkill[],
    _signal?: AbortSignal,
  ): Promise<unknown> {
    const approved = new Set(candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.name));
    return [
      ...new Set(this.#selectedSkills.get(input.requestId) ?? []),
    ].filter((name) => approved.has(name));
  }

  takeTelemetry(requestId: string): ClassifierTelemetry | undefined {
    const telemetry = this.#telemetry.get(requestId);
    this.#telemetry.delete(requestId);
    this.#selectedSkills.delete(requestId);
    return telemetry;
  }

  takeRequestSignals(requestId: string) {
    const signals = this.#requestSignals.get(requestId);
    this.#requestSignals.delete(requestId);
    return signals;
  }
}

/** Deterministic port used by the shadow corpus and failure-path tests. */
export class FakeBehaviorClassifier implements TaskClassifier, SkillRouter {
  constructor(
    private readonly output: ClassifierFixtureOutput,
    private readonly failure?: Error,
  ) {}

  async classify(_input: TaskClassifierInput, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.failure) throw this.failure;
    return this.output;
  }

  async select(
    _input: SkillRouterInput,
    candidates: readonly AvailableSkill[],
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const approved = new Set(candidates.map((candidate) => candidate.name));
    return routedSkillNames(this.output).filter((name) => approved.has(name));
  }

  takeRequestSignals(_requestId: string) {
    return {
      explicitOnboarding: this.output.explicitOnboarding ?? false,
      explicitLighterProcess: this.output.explicitLighterProcess ?? false,
      mutationRequested: this.output.mutationRequested ?? true,
      ...(this.output.lighterProcessReason
        ? { lighterProcessReason: this.output.lighterProcessReason }
        : {}),
    };
  }
}
