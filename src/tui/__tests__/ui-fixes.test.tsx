import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ToolStep } from "../ToolStep.tsx";
import { MarkdownText } from "../MarkdownText.tsx";
import { ReverseSearch } from "../ReverseSearch.tsx";
import { hasPendingTool, QueuedPrompts, type ToolEntry } from "../App.tsx";

function frame(el: React.ReactElement): string {
  const { lastFrame, unmount } = render(el);
  const out = lastFrame() ?? "";
  unmount();
  return out;
}

// ── fix/02 — spinner follows present state, not turn history ─────────────
describe("fix/02 hasPendingTool", () => {
  const step = (id: string, output?: string): ToolEntry => ({ id, toolName: "read", input: {}, output });

  test("false when every tool step has a result (nothing running now)", () => {
    // The bug: a completed tool step in the turn used to suppress the spinner forever.
    // hasPendingTool looks at present state, so a finished step does NOT count as pending.
    expect(hasPendingTool([step("a", "done"), step("b", "done")])).toBe(false);
  });

  test("true when at least one tool step is still running", () => {
    expect(hasPendingTool([step("a", "done"), step("b")])).toBe(true);
  });

  test("false on empty (no tools yet → spinner allowed)", () => {
    expect(hasPendingTool([])).toBe(false);
  });
});

// ── fix/05 — queued prompts show their text, not just the count ──────────
describe("fix/05 QueuedPrompts", () => {
  test("empty queue → renders nothing", () => {
    expect(frame(<QueuedPrompts queue={[]} />)).toBe("");
  });

  test("shows the text of queued prompts (not just a number)", () => {
    const out = frame(<QueuedPrompts queue={["fix the login bug", "then run the tests"]} />);
    expect(out).toContain("fix the login bug");
    expect(out).toContain("then run the tests");
  });

  test("caps at 3 with a +N more tail; truncates long prompts", () => {
    const long = "x".repeat(80);
    const out = frame(<QueuedPrompts queue={[long, "bravo", "charlie", "delta", "echo"]} />);
    expect(out).toContain("…"); // long prompt truncated
    expect(out).toContain("+2 more queued");
    expect(out).not.toContain("delta"); // 4th/5th not listed individually
    expect(out).not.toContain("echo");
  });
});

// ── fix/06 — markdown tables ─────────────────────────────────────────────
describe("fix/06 markdown tables", () => {
  const table = ["| Name | Role |", "| --- | --- |", "| Ada | Eng |", "| Bob | PM |"].join("\n");

  test("renders aligned columns, not raw pipes/dashes", () => {
    const out = frame(<MarkdownText content={table} />);
    expect(out).toContain("Name");
    expect(out).toContain("Role");
    expect(out).toContain("Ada");
    expect(out).toContain("Bob");
    // header/data cells no longer carry literal table pipes
    expect(out).not.toContain("| Ada |");
    expect(out).not.toContain("| --- |");
    // separator uses box-drawing dashes, not markdown dashes
    expect(out).toContain("─");
  });

  test("non-table content with a leading pipe is left untouched (no false positive)", () => {
    const out = frame(<MarkdownText content={"| just a pipe line\nnext"} />);
    // no separator row after it → not treated as a table, rendered verbatim
    expect(out).toContain("| just a pipe line");
  });

  test("plain markdown still renders (no regression)", () => {
    const out = frame(<MarkdownText content={"# H\ntext **b**\n- item"} />);
    expect(out).toContain("H");
    expect(out).toContain("• item");
    expect(out).not.toContain("**");
  });
});

// ── fix/08 A4 — collapse/expand tool output ──────────────────────────────
describe("fix/08 A4 collapsed tool output", () => {
  test("expanded (default) shows the output preview", () => {
    const out = frame(<ToolStep tool={{ toolName: "read", input: { path: "a.ts" }, output: "hello world" }} />);
    expect(out).toContain("read a.ts");
    expect(out).toContain("hello world");
  });

  test("collapsed hides the output preview, keeps the synthetic row", () => {
    const out = frame(
      <ToolStep tool={{ toolName: "read", input: { path: "a.ts" }, output: "hello world" }} collapsed />,
    );
    expect(out).toContain("read a.ts");
    expect(out).not.toContain("hello world");
  });

  test("collapsed still shows errors (they matter even when collapsed)", () => {
    const out = frame(
      <ToolStep tool={{ toolName: "read", input: { path: "a.ts" }, output: "Error: nope", isError: true }} collapsed />,
    );
    expect(out).toContain("Error: nope");
  });

  test("collapsed bash block hides its output body", () => {
    const out = frame(
      <ToolStep tool={{ toolName: "bash", input: { command: "ls" }, output: "file1\nfile2" }} collapsed />,
    );
    expect(out).toContain("$ ls");
    expect(out).not.toContain("file1");
  });
});

// ── fix/08 A6 — reverse search over prompt history ───────────────────────
describe("fix/08 A6 ReverseSearch", () => {
  const history = ["git status", "bun test ./src", "git commit -m x"];

  test("typing filters history and shows the top match", async () => {
    const { stdin, lastFrame, unmount } = render(
      <ReverseSearch history={history} onAccept={() => {}} onCancel={() => {}} />,
    );
    stdin.write("test");
    await new Promise((r) => setTimeout(r, 20));
    const out = lastFrame() ?? "";
    expect(out).toContain("bun test ./src");
    unmount();
  });

  test("Enter accepts the current match", async () => {
    let accepted = "";
    const { stdin, unmount } = render(
      <ReverseSearch history={history} onAccept={(v) => (accepted = v)} onCancel={() => {}} />,
    );
    stdin.write("commit");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r"); // Enter
    await new Promise((r) => setTimeout(r, 20));
    expect(accepted).toBe("git commit -m x");
    unmount();
  });

  test("Esc cancels", async () => {
    let cancelled = false;
    const { stdin, unmount } = render(
      <ReverseSearch history={history} onAccept={() => {}} onCancel={() => (cancelled = true)} />,
    );
    stdin.write("\x1b"); // Esc
    await new Promise((r) => setTimeout(r, 20));
    expect(cancelled).toBe(true);
    unmount();
  });

  test("no match → shows (no match), Enter cancels instead of accepting garbage", async () => {
    let accepted = "";
    let cancelled = false;
    const { stdin, lastFrame, unmount } = render(
      <ReverseSearch history={history} onAccept={(v) => (accepted = v)} onCancel={() => (cancelled = true)} />,
    );
    stdin.write("zzzznope");
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame() ?? "").toContain("(no match)");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(accepted).toBe("");
    expect(cancelled).toBe(true);
    unmount();
  });
});
