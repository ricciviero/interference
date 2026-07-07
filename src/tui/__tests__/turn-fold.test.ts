import { describe, test, expect } from "bun:test";
import { initTurnFold, foldTurnChunk, finishTurnFold, type TurnBlock } from "../App.tsx";
import type { Chunk } from "../../agent/loop.ts";

// Drive a whole turn's chunks through the pure reducer and collect committed blocks in order.
function runTurn(chunks: Chunk[], now = () => 0): TurnBlock[] {
  let state = initTurnFold();
  const out: TurnBlock[] = [];
  for (const c of chunks) {
    const { commit, state: next } = foldTurnChunk(state, c, now());
    out.push(...commit);
    state = next;
  }
  out.push(...finishTurnFold(state, now()));
  return out;
}

const r = (text: string): Chunk => ({ type: "reasoning", text });
const t = (text: string): Chunk => ({ type: "text", text });
const call = (id: string, name: string, input: unknown): Chunk => ({ type: "tool-call", toolCallId: id, toolName: name, input });
const result = (id: string, name: string, output: string): Chunk => ({ type: "tool-result", toolCallId: id, toolName: name, output, isError: false });

describe("foldTurnChunk — chronological turn order", () => {
  test("think → tool → think → answer commits in real order", () => {
    const blocks = runTurn([
      r("scompongo "), r("il task"),
      call("c1", "read", { path: "a.ts" }),
      result("c1", "read", "file body"),
      r("ora rispondo"),
      t("Fatto: "), t("letto a.ts."),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["thought", "tool", "thought", "assistant"]);
    expect(blocks[0]).toMatchObject({ type: "thought", content: "scompongo il task" });
    expect(blocks[1]).toMatchObject({ type: "tool" });
    expect((blocks[1] as { tool: { toolName: string } }).tool.toolName).toBe("read");
    expect(blocks[2]).toMatchObject({ type: "thought", content: "ora rispondo" });
    expect(blocks[3]).toMatchObject({ type: "assistant", content: "Fatto: letto a.ts." });
  });

  test("a plain answer (no thinking, no tools) is a single assistant block", () => {
    const blocks = runTurn([t("Ciao"), t(", come va?")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "assistant", content: "Ciao, come va?" });
  });

  test("thought that never yields text is still committed at end of turn", () => {
    const blocks = runTurn([r("penso e basta")]);
    expect(blocks.map((b) => b.type)).toEqual(["thought"]);
  });

  test("parallel tools: each commits when its own result arrives (completion order)", () => {
    const blocks = runTurn([
      call("a", "task", { d: "auth" }),
      call("b", "task", { d: "db" }),
      result("b", "task", "db done"), // b finishes first
      result("a", "task", "auth done"),
      t("Both explored."),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["tool", "tool", "assistant"]);
    // committed in completion order: b before a
    expect((blocks[0] as { tool: { id: string } }).tool.id).toBe("b");
    expect((blocks[1] as { tool: { id: string } }).tool.id).toBe("a");
  });

  test("thought duration is now - reasoningStart when a boundary closes it", () => {
    let state = initTurnFold();
    ({ state } = foldTurnChunk(state, r("hmm"), 1000)); // reasoningStart = 1000
    const { commit } = foldTurnChunk(state, call("c1", "read", {}), 3500); // closes thought at 3500
    expect(commit[0]).toMatchObject({ type: "thought", ms: 2500 });
  });
});
