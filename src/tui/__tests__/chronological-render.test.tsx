import { describe, test, expect } from "bun:test";
import React from "react";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { MsgBlock } from "../App.tsx";
import { TodoList } from "../TodoList.tsx";
import type { Todo } from "../../tools/todowrite.ts";

describe("MsgBlock — typed chronological blocks", () => {
  test("a committed thought is collapsed to its header (body hidden)", () => {
    // First line becomes the header summary; the rest is the body, hidden when collapsed.
    const { lastFrame, unmount } = render(
      <MsgBlock item={{ kind: "thought", id: 1, content: "Breve.\nBODYHIDDEN dettaglio del ragionamento", ms: 2000 }} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Thought"); // header present
    expect(out).not.toContain("BODYHIDDEN"); // body folded away
    unmount();
  });

  test("a tool block renders the tool", () => {
    const { lastFrame, unmount } = render(
      <MsgBlock item={{ kind: "tool", id: 2, tool: { id: "c1", toolName: "read", input: { path: "a.ts" }, output: "ok" } }} />,
    );
    expect(lastFrame() ?? "").toContain("a.ts");
    unmount();
  });

  test("a chronological turn renders top-to-bottom in real order (thought → tool → thought → answer)", () => {
    // Short single-word markers (no underscores — reasoningSummary strips them as emphasis).
    const items = [
      { kind: "user" as const, id: 1, content: "vai" },
      { kind: "thought" as const, id: 2, content: "Alpha prima analisi." },
      { kind: "tool" as const, id: 3, tool: { id: "c1", toolName: "read", input: { path: "AAA.ts" }, output: "ok" } },
      { kind: "thought" as const, id: 4, content: "Bravo ora rispondo." },
      { kind: "assistant" as const, id: 5, content: "Charlie fine." },
    ];
    const { lastFrame, unmount } = render(
      <Box flexDirection="column">
        {items.map((it) => (
          <MsgBlock key={it.id} item={it} />
        ))}
      </Box>,
    );
    const out = lastFrame() ?? "";
    const iThought1 = out.indexOf("Alpha");
    const iTool = out.indexOf("AAA");
    const iThought2 = out.indexOf("Bravo");
    const iAnswer = out.indexOf("Charlie");
    // All present and in chronological order.
    expect(iThought1).toBeGreaterThanOrEqual(0);
    expect(iThought1).toBeLessThan(iTool);
    expect(iTool).toBeLessThan(iThought2);
    expect(iThought2).toBeLessThan(iAnswer);
    unmount();
  });
});

describe("TodoList — only active tasks", () => {
  const mk = (content: string, status: Todo["status"]): Todo => ({ content, status, priority: "medium" });

  test("renders nothing when there are no active tasks (all done)", () => {
    const { lastFrame, unmount } = render(
      <TodoList todos={[mk("a", "completed"), mk("b", "completed")]} />,
    );
    expect((lastFrame() ?? "").trim()).toBe("");
    unmount();
  });

  test("shows only pending/in-progress tasks, count over all", () => {
    const { lastFrame, unmount } = render(
      <TodoList todos={[mk("done one", "completed"), mk("doing X", "in_progress"), mk("later Y", "pending")]} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("todos 1/3"); // 1 completed of 3
    expect(out).toContain("doing X");
    expect(out).toContain("later Y");
    expect(out).not.toContain("done one"); // completed folded into the count
    unmount();
  });
});
