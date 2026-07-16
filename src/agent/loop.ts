import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { resolveModel, type ModelOverride } from "../provider.ts";
import {
  currentMode,
  currentModel,
  currentProviderId,
  maxContinuations,
  maxStepsPerCall,
  PROVIDERS,
  reasoningConfig,
  type AgentMode,
} from "../config.ts";
import { systemPrompt } from "./prompt.ts";
import { toolsForMode } from "../tools/index.ts";
import { trackUsage } from "../cost.ts";
import { getTodos } from "../tools/todowrite.ts";
import {
  capabilitiesForLegacyTools,
  behaviorRequestId,
  evaluateAuthoritativeTurn,
  isAuthoritativeBehaviorEnabled,
  scheduleShadowTurn,
} from "../behavior/runtime.ts";
import {
  AGENTIC_SWE_PACKAGE_VERSION,
  type BehaviorSessionSnapshot,
  type BehaviorTurnContext,
} from "../behavior/types.ts";
import { toolsForBehavior } from "../behavior/authorization.ts";
import {
  currentBehaviorExecution,
  type BehaviorExecutionContext,
} from "../behavior/context.ts";
import { loadSkillBody } from "../skills.ts";
import {
  evaluateCompletion,
  PROTOCOL_VERSION,
  type HostExecutionEvent,
  type ProjectConfig,
} from "@agenticswe/core";
import { BehaviorEventRecorder } from "../behavior/events.ts";
import type { ShadowEvaluation } from "../behavior/types.ts";

export type Chunk =
  | { type: "text" | "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: string; isError: boolean };

// --- Continuation loop (fix/09) --------------------------------------------
// The turn no longer ends silently at a hardcoded step cap. After each streamText
// call we read finishReason and decide whether to keep going:
//  - cut-off (tool-calls/length): the model was capped mid-work → continue (the
//    messages end with tool results, so the next call resumes naturally).
//  - natural stop + PRIMARY turn + pending todos + under the nudge cap → nudge
//    (push a "continue" user message) — the keep-going behavior.
//  - otherwise → stop. If the continuation backstop is hit → limit (told to the user).

export type LoopAction = "stop" | "continue" | "nudge" | "limit";

/** Pure decision for the continuation loop — testable without the AI SDK. */
export function nextLoopAction(p: {
  finishReason: string;
  isPrimaryTurn: boolean;
  hasPendingTodos: boolean;
  round: number;
  nudges: number;
  maxContinuations: number;
  maxNudges: number;
  aborted: boolean;
}): LoopAction {
  if (p.aborted) return "stop";
  const cutOff = p.finishReason === "tool-calls" || p.finishReason === "length";
  const wantNudge = !cutOff && p.isPrimaryTurn && p.hasPendingTodos && p.nudges < p.maxNudges;
  if (!cutOff && !wantNudge) return "stop";
  if (p.round >= p.maxContinuations) return "limit";
  return wantNudge ? "nudge" : "continue";
}

const MAX_NUDGES = 3;
const CONTINUE_NUDGE =
  "Continue. Keep working through the remaining steps with your tools until the task is " +
  "fully complete — do not stop midway to hand back a plan.";
const MAX_PROTOCOL_NUDGES = 3;

export function planningRecordFromEvents(
  events: readonly HostExecutionEvent[],
  config: ProjectConfig | null,
): string | undefined {
  if (!config) return undefined;
  const roots = [
    config.workflow.iteration_directory.replace(/\/$/, ""),
    config.workflow.fix_directory.replace(/\/$/, ""),
  ];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.outcome !== "succeeded" || event.evidenceKind !== "planning" || !event.subject) {
      continue;
    }
    for (const root of roots) {
      if (!event.subject.startsWith(`${root}/`)) continue;
      const record = event.subject.slice(root.length + 1).split("/")[0];
      if (record) return `${root}/${record}`;
    }
  }
  return undefined;
}

export type ProtocolLoopAction = "stop" | "nudge" | "limit";

export function nextProtocolLoopAction(input: {
  naturalStop: boolean;
  needsContinuation: boolean;
  refusedOrAborted: boolean;
  protocolNudges: number;
  maxProtocolNudges: number;
  round: number;
  maxContinuations: number;
}): ProtocolLoopAction {
  if (!input.naturalStop || input.refusedOrAborted || !input.needsContinuation) return "stop";
  if (
    input.protocolNudges >= input.maxProtocolNudges ||
    input.round >= input.maxContinuations
  ) return "limit";
  return "nudge";
}

function protocolNudge(plan: ShadowEvaluation["plan"], outstanding: readonly string[]): string {
  const requiredGate = plan.requiredGates.find((gate) =>
    gate.status === "required" || gate.status === "pending" || gate.status === "blocked",
  );
  const action = requiredGate
    ? `Satisfy the ${requiredGate.id} gate (${requiredGate.reasonCode}).`
    : `Address the outstanding hard criteria: ${outstanding.join(", ")}.`;
  return `Agentic SWE has not accepted completion. ${action} Continue only with the currently exposed tools and produce host-verifiable evidence.`;
}

function hasTerminalRefusal(events: readonly HostExecutionEvent[]): boolean {
  return events.some((event) =>
    event.type === "tool.refused" || event.type === "turn.aborted",
  );
}

/** Pending work still on the (global) todo list. Only consulted for the primary turn:
 *  subagents don't own the list, so they must never auto-nudge on it. */
function hasPendingTodos(): boolean {
  return getTodos().some((t) => t.status === "pending" || t.status === "in_progress");
}

function latestUserText(messages: readonly ModelMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    return text || null;
  }
  return null;
}

export function shouldScheduleShadowForTurn(
  overrideSystem: string | undefined,
  behaviorContext: BehaviorTurnContext | undefined,
): behaviorContext is BehaviorTurnContext {
  return overrideSystem === undefined && behaviorContext !== undefined;
}

export function canResumeBehaviorSnapshot(
  savedTurnNumber: number | undefined,
  currentTurnNumber: number,
  savedRequestId: string | undefined,
  currentRequestId: string,
  events: readonly HostExecutionEvent[] = [],
): boolean {
  return savedTurnNumber !== undefined &&
    savedTurnNumber === currentTurnNumber &&
    savedRequestId !== undefined &&
    savedRequestId === currentRequestId &&
    !hasTerminalRefusal(events);
}

export function protocolCompletionGuardApplies(
  mutationRequested: boolean | undefined,
  phase: ShadowEvaluation["plan"]["phase"] | undefined,
): boolean {
  return mutationRequested === true && (phase === "execution" || phase === "verification");
}

export async function* runTurn(
  messages: ModelMessage[],
  signal?: AbortSignal,
  mode?: AgentMode,
  skillBodies?: string[],
  overrideSystem?: string,
  modelOverride?: ModelOverride,
  // Explicit toolset (AgentDef.tools, it. 34/36) — REPLACES toolsForMode(mode).
  // Without this, a read-only subagent (explore/review) would still receive write/
  // edit/bash when the main thread is in Build: "read-only" would be enforced
  // only by the prompt text, not by the code (violates CLAUDE.md §6.10). Real bug found
  // in E2E during it. 36.
  toolsOverride?: ToolSet,
  behaviorContext?: BehaviorTurnContext,
): AsyncGenerator<Chunk> {
  const reasoning = reasoningConfig({
    providerId: modelOverride?.provider,
    model: modelOverride?.model,
    level: modelOverride?.thinkingLevel,
  });
  const effectiveMode = mode ?? currentMode();
  const hostTools = toolsOverride ?? toolsForMode(effectiveMode);
  let tools = hostTools;

  const isPrimaryTurn = overrideSystem === undefined;
  const summary = isPrimaryTurn ? latestUserText(messages) : null;
  let authoritativeContext: BehaviorExecutionContext | undefined;
  let authoritativeSkills: string[] | undefined;
  let currentEvaluation: ShadowEvaluation | undefined;
  let currentSnapshot: BehaviorSessionSnapshot | undefined;
  let recorder: BehaviorEventRecorder | undefined;

  // A specialized run created inside an authoritative task inherits the parent
  // plan, then intersects it again with the concrete child toolset. It never
  // classifies independently and cannot regain capabilities hidden by AgentDef.
  const inheritedBehavior = !isPrimaryTurn ? currentBehaviorExecution() : undefined;
  if (inheritedBehavior) {
    const childHostCapabilities = new Set(
      capabilitiesForLegacyTools(Object.keys(hostTools)),
    );
    authoritativeContext = {
      ...inheritedBehavior,
      effectiveCapabilities: inheritedBehavior.effectiveCapabilities.filter((capability) =>
        childHostCapabilities.has(capability),
      ),
    };
    tools = toolsForBehavior(hostTools, authoritativeContext);
  }

  const selectedSkillBodies = async (evaluation: ShadowEvaluation): Promise<string[]> =>
    (
      await Promise.all(
        evaluation.plan.selectedSkills.map((skill) => loadSkillBody(skill.name)),
      )
    ).filter((body): body is string => body !== null);

  const snapshotFor = (
    evaluation: ShadowEvaluation,
    events: readonly HostExecutionEvent[],
  ): BehaviorSessionSnapshot => {
    const evidence = recorder?.evidence() ?? [];
    const completion = evaluateCompletion(evaluation.plan, evidence);
    const planningRecord =
      planningRecordFromEvents(events, evaluation.projectConfig) ??
      currentSnapshot?.planningRecord ??
      behaviorContext?.planningRecord;
    return {
      schemaVersion: 1,
      protocolVersion: evaluation.plan.protocolVersion,
      packageVersion: AGENTIC_SWE_PACKAGE_VERSION,
      requestId: evaluation.plan.requestId,
      phase: evaluation.plan.phase,
      turnNumber: behaviorContext?.turnNumber ?? 0,
      ...(planningRecord ? { planningRecord } : {}),
      plan: evaluation.plan,
      effectiveCapabilities: [...evaluation.effectiveCapabilities],
      events: [...events],
      evidence,
      outstandingCriteria: completion.outstanding.map((criterion) => criterion.id),
      state: {
        protocolVersion: evaluation.plan.protocolVersion,
        sessionId: behaviorContext?.sessionId ?? "unknown",
        requestId: evaluation.plan.requestId,
        phase: evaluation.plan.phase,
        sequence: behaviorContext?.turnNumber ?? 0,
        effectiveClassification: evaluation.plan.effectiveClassification,
        gates: evaluation.plan.requiredGates,
        selectedSkills: evaluation.plan.selectedSkills,
        evidenceIds: evidence.map((item) => item.id),
      },
    };
  };

  if (
    isPrimaryTurn &&
    behaviorContext &&
    summary &&
    isAuthoritativeBehaviorEnabled()
  ) {
    const resumeBehavior = canResumeBehaviorSnapshot(
      behaviorContext.savedTurnNumber,
      behaviorContext.turnNumber,
      behaviorContext.savedRequestId,
      behaviorRequestId(behaviorContext.sessionId, behaviorContext.turnNumber, summary),
      behaviorContext.events,
    );
    if (
      (behaviorContext.savedProtocolVersion !== undefined &&
        behaviorContext.savedProtocolVersion !== PROTOCOL_VERSION) ||
      (behaviorContext.savedPackageVersion !== undefined &&
        behaviorContext.savedPackageVersion !== AGENTIC_SWE_PACKAGE_VERSION)
    ) {
      throw new Error("Saved Agentic SWE state is incompatible; authoritative mode is read-only.");
    }
    const toolNames = Object.keys(hostTools).sort();
    const evaluation = await evaluateAuthoritativeTurn(
      {
        sessionId: behaviorContext.sessionId,
        turnNumber: behaviorContext.turnNumber,
        summary,
        legacy: {
          mode: effectiveMode,
          toolNames,
          selectedSkills: [...(behaviorContext.selectedSkillNames ?? [])].sort(),
          capabilities: capabilitiesForLegacyTools(toolNames),
        },
        ...(resumeBehavior && behaviorContext.planningRecord
          ? { planningRecord: behaviorContext.planningRecord }
          : {}),
        ...(resumeBehavior && behaviorContext.state ? { state: behaviorContext.state } : {}),
      },
      signal,
    );
    if (!evaluation) {
      throw new Error(
        "Agentic SWE authoritative evaluation failed; workspace mutation was not enabled.",
      );
    }
    currentEvaluation = evaluation;
    recorder = new BehaviorEventRecorder(
      behaviorContext.sessionId,
      evaluation.plan.requestId,
      behaviorContext.turnNumber,
      resumeBehavior ? behaviorContext.events ?? [] : [],
      async (events) => {
        if (!currentEvaluation) return;
        currentSnapshot = snapshotFor(currentEvaluation, events);
        await behaviorContext.onPlan?.(currentSnapshot);
      },
    );
    authoritativeContext = {
      sessionId: behaviorContext.sessionId,
      turnNumber: behaviorContext.turnNumber,
      requestId: evaluation.plan.requestId,
      plan: evaluation.plan,
      effectiveCapabilities: evaluation.effectiveCapabilities,
      projectConfig: evaluation.projectConfig,
      recorder,
    };
    tools = toolsForBehavior(hostTools, authoritativeContext);
    authoritativeSkills = await selectedSkillBodies(evaluation);
    currentSnapshot = snapshotFor(evaluation, recorder.events());
    await behaviorContext.onPlan?.(currentSnapshot);
  }

  // The family profile (it. 33) follows the EFFECTIVE model for this turn (subagent
  // override if present, otherwise the global one) — so /model changes it at runtime.
  const renderCurrentSystem = (): string => {
    let text = overrideSystem ?? systemPrompt(
      effectiveMode,
      undefined,
      modelOverride?.model ?? currentModel(),
      authoritativeContext
        ? {
            plan: authoritativeContext.plan,
            effectiveCapabilities: authoritativeContext.effectiveCapabilities,
          }
        : undefined,
    );
    const effectiveSkillBodies = authoritativeContext ? authoritativeSkills : skillBodies;
    if (effectiveSkillBodies && effectiveSkillBodies.length > 0) {
      text += "\n\n<skill_context>\n" + effectiveSkillBodies.join("\n\n---\n\n") + "\n</skill_context>";
    }
    return text;
  };
  let systemText = renderCurrentSystem();

  // Prompt caching (it. 35, opt-in Anthropic): mark the entire system as a cacheable
  // block. From the 2nd turn with the same prefix, tokens are read from cache
  // (~10% of full price) instead of being paid for in full. DeepSeek/OpenAI/GLM/
  // Kimi cache automatically server-side (no parameter to send).
  const effectiveProviderId = modelOverride?.provider ?? currentProviderId();
  const isAnthropic = PROVIDERS[effectiveProviderId]?.kind === "anthropic";
  const wrapSystem = (text: string) => isAnthropic
    ? {
        role: "system" as const,
        content: text,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
      }
    : text;
  let system = wrapSystem(systemText);

  // Dynamic import of the @ai-sdk/* package (it. 38) — async, resolved once per turn.
  const model = await resolveModel(modelOverride);

  const refreshAuthoritativePlan = async (requestFinished = false): Promise<boolean> => {
    if (!currentEvaluation || !authoritativeContext || !behaviorContext || !summary || !recorder) {
      return false;
    }
    const previousPhase = currentEvaluation.plan.phase;
    const events = recorder.events();
    const evidence = recorder.evidence();
    const planningRecord =
      planningRecordFromEvents(events, currentEvaluation.projectConfig) ??
      currentSnapshot?.planningRecord;
    const implementationFinished =
      evidence.some((item) => item.kind === "implementation") ||
      (!currentEvaluation.requestSignals.mutationRequested && requestFinished);
    const toolNames = Object.keys(hostTools).sort();
    const refreshed = await evaluateAuthoritativeTurn(
      {
        sessionId: behaviorContext.sessionId,
        turnNumber: behaviorContext.turnNumber,
        summary,
        legacy: {
          mode: effectiveMode,
          toolNames,
          selectedSkills: [...(behaviorContext.selectedSkillNames ?? [])].sort(),
          capabilities: capabilitiesForLegacyTools(toolNames),
        },
        classification: currentEvaluation.classification,
        requestSignals: currentEvaluation.requestSignals,
        relevantSkills: currentEvaluation.relevantSkills,
        implementationFinished,
        evidence,
        ...(planningRecord ? { planningRecord } : {}),
        ...(currentSnapshot?.state ? { state: currentSnapshot.state } : {}),
      },
      signal,
    );
    if (!refreshed) {
      throw new Error("Agentic SWE could not refresh the authoritative plan; access remains closed.");
    }
    currentEvaluation = refreshed;
    authoritativeContext = {
      sessionId: behaviorContext.sessionId,
      turnNumber: behaviorContext.turnNumber,
      requestId: refreshed.plan.requestId,
      plan: refreshed.plan,
      effectiveCapabilities: refreshed.effectiveCapabilities,
      projectConfig: refreshed.projectConfig,
      recorder,
    };
    tools = toolsForBehavior(hostTools, authoritativeContext);
    authoritativeSkills = await selectedSkillBodies(refreshed);
    currentSnapshot = snapshotFor(refreshed, events);
    await behaviorContext.onPlan?.(currentSnapshot);
    systemText = renderCurrentSystem();
    system = wrapSystem(systemText);
    return previousPhase !== refreshed.plan.phase;
  };

  // A turn with a custom system prompt is a specialized run (subagent/review). Only the
  // PRIMARY turn (no overrideSystem) may auto-nudge on the shared todo list. Keeps the
  // ~8 runTurn call sites unchanged: no signature/argument churn (fix/09).
  if (shouldScheduleShadowForTurn(overrideSystem, behaviorContext)) {
    if (summary && !authoritativeContext) {
      const toolNames = Object.keys(tools).sort();
      scheduleShadowTurn(
        {
          sessionId: behaviorContext.sessionId,
          turnNumber: behaviorContext.turnNumber,
          summary,
          legacy: {
            mode: effectiveMode,
            toolNames,
            selectedSkills: [...(behaviorContext.selectedSkillNames ?? [])].sort(),
            capabilities: capabilitiesForLegacyTools(toolNames),
          },
          ...(behaviorContext.planningRecord
            ? { planningRecord: behaviorContext.planningRecord }
            : {}),
        },
        signal,
      );
    }
  }
  const stepCap = maxStepsPerCall();
  const maxCont = maxContinuations();
  let round = 0;
  let nudges = 0;
  let protocolNudges = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = streamText({
      model,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(stepCap),
      abortSignal: signal,
      onError: () => {},
      ...(reasoning.providerOptions
        ? {
            providerOptions: reasoning.providerOptions as Parameters<
              typeof streamText
            >[0]["providerOptions"],
          }
        : {}),
      ...(reasoning.maxOutputTokens ? { maxOutputTokens: reasoning.maxOutputTokens } : {}),
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          yield { type: "text", text: part.text };
          break;

        case "reasoning-delta":
          yield { type: "reasoning", text: part.text };
          break;

        case "tool-call":
          // toolCallId (from the SDK, unique per call) lets the UI correlate
          // call/result correctly when multiple tools run in parallel (e.g. multiple
          // `task` subagents in the same step) — result arrival order is NOT guaranteed
          // to match call order.
          yield { type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, input: part.input };
          break;

        case "tool-result": {
          const tr = part as unknown as {
            toolCallId: string;
            toolName: string;
            output: unknown;
            error?: unknown;
          };
          const err = tr.error;
          const out = tr.output;
          yield {
            type: "tool-result",
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: err
              ? String(err)
              : typeof out === "string"
                ? out
                : JSON.stringify(out),
            isError: !!err,
          };
          break;
        }

        case "error":
          throw part.error;
      }
    }

    const response = await result.response;
    messages.push(...response.messages);

    const usage = await result.usage;
    if (usage) {
      // usage.inputTokenDetails is the cross-provider field in ai@7 (Anthropic/DeepSeek/
      // openai-compatible all populate it) — cachedInputTokens flat is legacy, never
      // populated by the installed adapters. Fallback to total inputTokens if a provider
      // doesn't populate the details (no regression: cacheRead/Write stay 0).
      const noCache = usage.inputTokenDetails?.noCacheTokens ?? usage.inputTokens ?? 0;
      const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
      const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
      trackUsage(noCache, usage.outputTokens ?? 0, cacheRead, cacheWrite);
    }

    const finishReason = await result.finishReason;
    const naturalStop = String(finishReason) !== "tool-calls" && String(finishReason) !== "length";
    if (signal?.aborted) {
      await recorder?.record({ type: "turn.aborted", outcome: "aborted" }).catch(() => {});
      return;
    }
    if (naturalStop && recorder) {
      await recorder.record({ type: "completion.requested", outcome: "succeeded" });
    }
    const phaseChanged = await refreshAuthoritativePlan(naturalStop);
    const behaviorEvents = recorder?.events() ?? [];
    const refused = hasTerminalRefusal(behaviorEvents);
    const completion = currentEvaluation && recorder
      ? evaluateCompletion(currentEvaluation.plan, recorder.evidence())
      : undefined;
    const phase = currentEvaluation?.plan.phase;
    const gateIncomplete = phase === "setup" || phase === "planning";
    const completionGuardApplies = protocolCompletionGuardApplies(
      currentEvaluation?.requestSignals.mutationRequested,
      phase,
    );
    const needsProtocolContinuation =
      !refused &&
      phase !== "blocked" &&
      phase !== "aborted" &&
      phase !== "completion" &&
      (gateIncomplete || phaseChanged || (completionGuardApplies && !completion?.satisfied));

    const protocolAction = nextProtocolLoopAction({
      naturalStop,
      needsContinuation: needsProtocolContinuation,
      refusedOrAborted: refused,
      protocolNudges,
      maxProtocolNudges: MAX_PROTOCOL_NUDGES,
      round,
      maxContinuations: maxCont,
    });
    if (protocolAction === "limit" && currentEvaluation) {
        const outstanding = completion?.outstanding.map((criterion) => criterion.id) ?? [];
        yield {
          type: "text",
          text:
            `\n\n_[interference: Agentic SWE did not accept completion after ${protocolNudges} protocol nudges. ` +
            `Phase: ${currentEvaluation.plan.phase}; outstanding: ${outstanding.join(", ") || "required gate"}.]_\n`,
        };
        return;
    }
    if (protocolAction === "nudge" && currentEvaluation) {
      protocolNudges++;
      round++;
      const outstanding = completion?.outstanding.map((criterion) => criterion.id) ?? [];
      messages.push({
        role: "user",
        content: protocolNudge(currentEvaluation.plan, outstanding),
      });
      continue;
    }

    if (refused) return;
    const action = nextLoopAction({
      finishReason: String(finishReason),
      isPrimaryTurn,
      hasPendingTodos: hasPendingTodos(),
      round,
      nudges,
      maxContinuations: maxCont,
      maxNudges: MAX_NUDGES,
      aborted: signal?.aborted ?? false,
    });

    if (action === "stop") return;
    if (action === "limit") {
      yield {
        type: "text",
        text:
          `\n\n_[interference: reached the automatic-continuation limit (${maxCont}). ` +
          `Type "continue" to keep going, or raise maxSteps/maxContinuations.]_\n`,
      };
      return;
    }

    round++;
    if (action === "nudge") {
      nudges++;
      // Synthetic user turn: the model finished with text but todos are still open.
      messages.push({ role: "user", content: CONTINUE_NUDGE });
    }
    // "continue": messages already end with tool results; the next streamText resumes.
  }
}
