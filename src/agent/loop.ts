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

/** Pending work still on the (global) todo list. Only consulted for the primary turn:
 *  subagents don't own the list, so they must never auto-nudge on it. */
function hasPendingTodos(): boolean {
  return getTodos().some((t) => t.status === "pending" || t.status === "in_progress");
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
): AsyncGenerator<Chunk> {
  const reasoning = reasoningConfig({
    providerId: modelOverride?.provider,
    model: modelOverride?.model,
    level: modelOverride?.thinkingLevel,
  });
  const effectiveMode = mode ?? currentMode();
  const tools = toolsOverride ?? toolsForMode(effectiveMode);

  // The family profile (it. 33) follows the EFFECTIVE model for this turn (subagent
  // override if present, otherwise the global one) — so /model changes it at runtime.
  let systemText = overrideSystem ?? systemPrompt(effectiveMode, undefined, modelOverride?.model ?? currentModel());
  if (skillBodies && skillBodies.length > 0) {
    systemText += "\n\n<skill_context>\n" + skillBodies.join("\n\n---\n\n") + "\n</skill_context>";
  }

  // Prompt caching (it. 35, opt-in Anthropic): mark the entire system as a cacheable
  // block. From the 2nd turn with the same prefix, tokens are read from cache
  // (~10% of full price) instead of being paid for in full. DeepSeek/OpenAI/GLM/
  // Kimi cache automatically server-side (no parameter to send).
  const effectiveProviderId = modelOverride?.provider ?? currentProviderId();
  const isAnthropic = PROVIDERS[effectiveProviderId]?.kind === "anthropic";
  const system = isAnthropic
    ? {
        role: "system" as const,
        content: systemText,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
      }
    : systemText;

  // Dynamic import of the @ai-sdk/* package (it. 38) — async, resolved once per turn.
  const model = await resolveModel(modelOverride);

  // A turn with a custom system prompt is a specialized run (subagent/review). Only the
  // PRIMARY turn (no overrideSystem) may auto-nudge on the shared todo list. Keeps the
  // ~8 runTurn call sites unchanged: no signature/argument churn (fix/09).
  const isPrimaryTurn = overrideSystem === undefined;
  const stepCap = maxStepsPerCall();
  const maxCont = maxContinuations();
  let round = 0;
  let nudges = 0;

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
