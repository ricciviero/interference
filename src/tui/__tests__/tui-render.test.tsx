import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ToolStep } from "../ToolStep.tsx";
import { MarkdownText } from "../MarkdownText.tsx";
import { computeDiff } from "../DiffView.tsx";

function frame(el: React.ReactElement): string {
  const { lastFrame, unmount } = render(el);
  const out = lastFrame() ?? "";
  unmount();
  return out;
}

describe("ToolStep rendering (iter 18)", () => {
  test("inline tool: icon + name + synthetic label, no raw JSON", () => {
    const out = frame(<ToolStep tool={{ toolName: "read", input: { path: "src/y.ts" }, output: "10 lines" }} />);
    expect(out).toContain("→");
    expect(out).toContain("read src/y.ts");
    expect(out).not.toContain("{"); // no raw JSON
  });

  test("pending tool shows descriptive text (iter 21)", () => {
    const grep = frame(<ToolStep tool={{ toolName: "grep", input: { pattern: "foo" } }} />);
    expect(grep).toContain("~ Searching content…");
    const bash = frame(<ToolStep tool={{ toolName: "bash", input: { command: "ls" } }} />);
    expect(bash).toContain("~ Running command…");
  });

  test("bash block: command rendered with $ and output, on a left-border block", () => {
    const out = frame(<ToolStep tool={{ toolName: "bash", input: { command: "bun test" }, output: "77 pass" }} />);
    expect(out).toContain("$ bun test");
    expect(out).toContain("77 pass");
    expect(out).toContain("│"); // left border (no heavy full-width fill)
  });

  test("write block: title + content as added (+) lines with numbers", () => {
    const content = 'export const x = 1;\nexport const y = 2;\n';
    const out = frame(
      <ToolStep
        tool={{ toolName: "write", input: { path: "src/new.ts" }, output: "ok", diff: computeDiff([], content.split("\n")) }}
      />,
    );
    expect(out).toContain("← write src/new.ts");
    expect(out).toContain("+ export const x = 1;");
    expect(out).toContain("+ export const y = 2;");
    expect(out).toContain("│"); // left-border block, no heavy fill
  });

  test("write/edit pending show a descriptive verb, not the generic 'Working…'", () => {
    const w = frame(<ToolStep tool={{ toolName: "write", input: { path: "a.ts" } }} />);
    expect(w).toContain("Writing file…");
    expect(w).not.toContain("Working…");
    const e = frame(<ToolStep tool={{ toolName: "edit", input: { path: "a.ts" } }} />);
    expect(e).toContain("Editing file…");
  });

  test("task inline icon is distinct from the block-tool border (no '│' collision)", () => {
    const out = frame(<ToolStep tool={{ toolName: "task", input: { description: "explore auth" }, output: "done" }} />);
    expect(out).toContain("▸ task explore auth");
    expect(out).not.toContain("│"); // must not reuse the block border glyph
  });

  test("block pending shows the descriptive verb (bash)", () => {
    const out = frame(<ToolStep tool={{ toolName: "bash", input: { command: "bun test" } }} />);
    expect(out).toContain("$ bun test");
    expect(out).toContain("~ Running command…");
  });

  test("edit block: diff lines with +/-", () => {
    const out = frame(
      <ToolStep
        tool={{
          toolName: "edit",
          input: { path: "src/x.ts" },
          output: "ok",
          diff: [
            { type: "remove", text: "const a=1" },
            { type: "add", text: "const a=2" },
          ],
        }}
      />,
    );
    expect(out).toContain("← edit src/x.ts");
    expect(out).toContain("- const a=1");
    expect(out).toContain("+ const a=2");
  });
});

describe("diff line numbers (iter 20)", () => {
  test("computeDiff assigns old/new line numbers", () => {
    const d = computeDiff(["a", "b", "c"], ["a", "B", "c"]);
    expect(d).toEqual([
      { type: "same", text: "a", oldNo: 1, newNo: 1 },
      { type: "remove", text: "b", oldNo: 2 },
      { type: "add", text: "B", newNo: 2 },
      { type: "same", text: "c", oldNo: 3, newNo: 3 },
    ]);
  });

  test("edit block renders line numbers in the diff", () => {
    const d = computeDiff(["x"], ["y"]);
    const out = frame(<ToolStep tool={{ toolName: "edit", input: { path: "f.ts" }, output: "ok", diff: d }} />);
    expect(out).toContain("- x");
    expect(out).toContain("+ y");
    expect(out).toMatch(/\b1\b/); // line number present
  });
});

describe("MarkdownText rendering (iter 18)", () => {
  test("strips markdown markers, keeps content", () => {
    const out = frame(<MarkdownText content={"# Titolo\nUn **bold** e `code`.\n- item"} />);
    expect(out).toContain("Titolo");
    expect(out).toContain("bold");
    expect(out).toContain("code");
    expect(out).toContain("• item");
    expect(out).not.toContain("**");
    expect(out).not.toContain("`");
    expect(out).not.toContain("#");
  });
});
