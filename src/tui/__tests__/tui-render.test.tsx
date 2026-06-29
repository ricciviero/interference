import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ToolStep } from "../ToolStep.tsx";
import { MarkdownText } from "../MarkdownText.tsx";

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
    expect(out).not.toContain("{"); // niente JSON grezzo
  });

  test("bash block: command rendered with $ and output", () => {
    const out = frame(<ToolStep tool={{ toolName: "bash", input: { command: "bun test" }, output: "77 pass" }} />);
    expect(out).toContain("$ bun test");
    expect(out).toContain("77 pass");
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
