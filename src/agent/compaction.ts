import { generateText, type ModelMessage } from "ai";
import { resolveModel } from "../provider.ts";
import { currentModel, currentProvider, currentProviderId, currentMode, cheapModelFor } from "../config.ts";
import { getModelInfo } from "../catalog.ts";
import { getOpenRouterModelInfo } from "../openrouter.ts";
import { systemPrompt } from "./prompt.ts";

const COMPACT_THRESHOLD = 0.9;
const DEFAULT_CONTEXT = 200_000;

// Context from catalog (it. 37) with fallback to ProviderDef.contextLimit (config.ts) then
// to the default constant — no regression if the catalog is missing the id.
export function getContextLimit(): number {
  const pid = currentProviderId();
  // OpenRouter: per-model context from its own /models catalog (not in models.dev's snapshot).
  if (pid === "openrouter") {
    const or = getOpenRouterModelInfo(currentModel());
    if (or && or.contextLimit > 0) return or.contextLimit;
  }
  const info = getModelInfo(pid, currentModel());
  return info?.contextLimit ?? currentProvider().contextLimit ?? DEFAULT_CONTEXT;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// The system prompt is sent on EVERY request but lives outside `messages` (loop.ts
// passes it as the separate `system` param) — include it so the estimate reflects what
// the model actually receives. Uses the module's cached instructions/skills, same as loop.ts.
function estimateSystemPromptTokens(): number {
  return estimateTokens(systemPrompt(currentMode(), undefined, currentModel()));
}

export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = estimateSystemPromptTokens();
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as Array<{ text?: string; input?: unknown; output?: unknown; type: string }>) {
        // tool-call parts carry `input`, tool-result parts carry `output` — neither has a
        // `text` field, so the old `if (part.text)` skipped them and undercounted the
        // context drastically (file reads, bash/grep output are often the bulk of it).
        if (part.text) total += estimateTokens(part.text);
        else if (part.input !== undefined) total += estimateTokens(JSON.stringify(part.input));
        else if (part.output !== undefined) {
          const out = typeof part.output === "string" ? part.output : JSON.stringify(part.output);
          total += estimateTokens(out);
        }
      }
    }
  }
  return total;
}

export function shouldCompact(messages: ModelMessage[]): boolean {
  const limit = getContextLimit();
  const used = estimateMessagesTokens(messages);
  return used > limit * COMPACT_THRESHOLD;
}

export function getUsagePercent(messages: ModelMessage[]): number {
  const limit = getContextLimit();
  const used = estimateMessagesTokens(messages);
  return Math.round((used / limit) * 100);
}

export async function compactMessages(
  messages: ModelMessage[],
  preserveRecentTurns = 2,
): Promise<ModelMessage[]> {
  if (messages.length === 0) return messages;

  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") userIndices.push(i);
  }

  if (userIndices.length <= preserveRecentTurns) return messages;

  const splitIndex = userIndices[userIndices.length - preserveRecentTurns]!;
  const head = messages.slice(0, splitIndex);
  const tail = messages.slice(splitIndex);

  const summary = await generateSummary(head);
  if (!summary) return messages;

  const compacted: ModelMessage[] = [
    {
      role: "user",
      content: `<compacted_summary>\n${summary}\n</compacted_summary>\n\nContinue from where you left off.`,
    },
    {
      role: "assistant",
      content: "I'll continue with the remaining context.",
    },
    ...tail,
  ];

  return compacted;
}

async function generateSummary(
  messages: ModelMessage[],
): Promise<string | null> {
  const serialized = serializeMessages(messages);
  if (serialized.length < 100) return null;

  const prompt = `Summarize the following conversation between a user and an AI coding agent.
Focus on: what was done, which files were modified, key decisions made, and what remains to do.
Be concise but comprehensive. Write in the same language as the conversation.

<conversation>
${serialized.slice(0, 16000)}
</conversation>

Return ONLY the summary, no preamble.`;

  try {
    // Summary is a mechanical task: runs on the active provider's cheap model,
    // without touching global state (the main thread stays on the user's model).
    const pid = currentProviderId();
    const model = await resolveModel({ provider: pid, model: cheapModelFor(pid) });
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 2000,
    });
    return result.text.trim() || null;
  } catch {
    return null;
  }
}

function serializeMessages(messages: ModelMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const role = m.role === "user" ? "User" : m.role === "assistant" ? "Agent" : m.role;
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const truncated = content.length > 2000 ? content.slice(0, 2000) + "…" : content;
    lines.push(`[${role}]: ${truncated}`);
  }
  return lines.join("\n");
}
