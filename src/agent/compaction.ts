import { generateText, type ModelMessage } from "ai";
import { resolveModel } from "../provider.ts";
import { currentProvider } from "../config.ts";

const COMPACT_THRESHOLD = 0.9;

const CONTEXT_LIMITS: Record<string, number> = {
  "deepseek-v4-pro": 1_000_000,
  "claude-sonnet-4-6": 200_000,
  "glm-4.6": 200_000,
  "kimi-k2.6": 128_000,
  default: 128_000,
};

function getContextLimit(modelId: string): number {
  return CONTEXT_LIMITS[modelId] ?? CONTEXT_LIMITS.default!;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as Array<{ text?: string; type: string }>) {
        if (part.text) total += estimateTokens(part.text);
      }
    }
  }
  return total;
}

export function shouldCompact(
  messages: ModelMessage[],
  modelId?: string,
): boolean {
  const limit = getContextLimit(modelId ?? "default");
  const used = estimateMessagesTokens(messages);
  return used > limit * COMPACT_THRESHOLD;
}

export function getUsagePercent(
  messages: ModelMessage[],
  modelId?: string,
): number {
  const limit = getContextLimit(modelId ?? "default");
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
    const result = await generateText({
      model: resolveModel(),
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
