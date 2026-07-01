import type { ModelMessage } from "ai";
import { runTurn } from "./loop.ts";
import { getAgent, resolveAgentModelOverride } from "./registry.ts";

/** Diff of current changes (staged + working tree against HEAD). Used by `/review`
 *  to give the `review` agent real context without going through the agent's `bash` tool
 *  (direct command, outside the LLM loop — same pattern as `git.ts`). */
export async function getWorkingDiff(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "diff", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });
    const out = await proc.stdout.text();
    await proc.exited;
    return proc.exitCode === 0 ? out : "";
  } catch {
    return "";
  }
}

/** Runs the `review` agent (registry, it. 34/36) on a diff/snippet, isolated from the main
 *  thread (does not touch `messagesRef` — unlike /init or /skill which extend the
 *  conversation). Returns the textual findings report. */
export async function runReview(diffText: string): Promise<string> {
  if (!diffText.trim()) return "No changes to review.";

  const def = getAgent("review");
  if (!def) return "Review agent not found in the registry.";

  const messages: ModelMessage[] = [
    { role: "user", content: `Review this diff:\n\n${diffText}` },
  ];
  const modelOverride = resolveAgentModelOverride(def);

  let output = "";
  for await (const chunk of runTurn(messages, undefined, "build", undefined, def.systemPrompt, modelOverride, def.tools)) {
    if (chunk.type === "text") output += chunk.text;
  }
  return output || "(no output)";
}
