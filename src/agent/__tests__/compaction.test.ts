import { describe, test, expect } from "bun:test";
import { estimateMessagesTokens } from "../compaction.ts";
import type { ModelMessage } from "ai";

// Baseline = system prompt only (fixed cost now included, fix/04).
const baseline = () => estimateMessagesTokens([]);

describe("fix/04 — context estimate counts tool I/O and the system prompt", () => {
  test("empty messages → system prompt still counted (> 0)", () => {
    expect(estimateMessagesTokens([])).toBeGreaterThan(0);
  });

  test("large tool-result output is counted (used to be skipped → ~0)", () => {
    const big = "x".repeat(10_000);
    const msgs = [
      { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "read", output: big }] },
    ] as unknown as ModelMessage[];
    const delta = estimateMessagesTokens(msgs) - baseline();
    // ~10000/3.5 ≈ 2857 tokens — must be substantial, not ~0 (the bug).
    expect(delta).toBeGreaterThan(2000);
  });

  test("tool-call input is counted", () => {
    const msgs = [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "bash", input: { command: "y".repeat(4000) } }] },
    ] as unknown as ModelMessage[];
    const delta = estimateMessagesTokens(msgs) - baseline();
    expect(delta).toBeGreaterThan(1000);
  });

  test("structured (object) tool output counted via JSON", () => {
    const msgs = [
      { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "read", output: { type: "text", value: "z".repeat(7000) } }] },
    ] as unknown as ModelMessage[];
    const delta = estimateMessagesTokens(msgs) - baseline();
    expect(delta).toBeGreaterThan(1500);
  });

  test("plain text messages still counted (no regression)", () => {
    const msgs = [{ role: "user", content: "hello ".repeat(1000) }] as unknown as ModelMessage[];
    const delta = estimateMessagesTokens(msgs) - baseline();
    expect(delta).toBeGreaterThan(1000);
  });

  test("a tool-heavy session estimates much higher than the old text-only count", () => {
    // Simulate a real turn: read a big file + grep output. The old estimator counted
    // only `text` parts (≈ the system prompt), missing the tool I/O entirely.
    const fileContent = "const x = 1;\n".repeat(3000); // ~36k chars
    const grepOut = "src/a.ts:1: match\n".repeat(2000); // ~34k chars
    const msgs = [
      { role: "user", content: "read the config and grep for X" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "read", input: { path: "big.ts" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "read", output: fileContent }] },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "2", toolName: "grep", input: { pattern: "X" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "2", toolName: "grep", output: grepOut }] },
    ] as unknown as ModelMessage[];
    // ~70k chars of tool I/O → ~20k tokens. Old estimate would have been ~a few hundred.
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(15_000);
  });
});
