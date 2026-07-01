import { describe, test, expect, afterEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ModelPicker } from "../ModelPicker.tsx";
import { setProvider, resetModel, currentModel } from "../../config.ts";

const ARROW_DOWN = "[B";
const ENTER = "\r";

afterEach(() => {
  resetModel();
  setProvider("deepseek");
});

describe("ModelPicker grouped by provider (iter 38)", () => {
  test("shows section headers for each provider with models", () => {
    setProvider("deepseek");
    const { lastFrame, unmount } = render(<ModelPicker onCancel={() => {}} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("DeepSeek");
    expect(out).toContain("Anthropic (Claude)");
    expect(out).toContain("OpenAI");
    unmount();
  });

  test("the current provider is at the top of the list", () => {
    setProvider("anthropic");
    const { lastFrame, unmount } = render(<ModelPicker onCancel={() => {}} />);
    const out = lastFrame() ?? "";
    const anthropicIdx = out.indexOf("Anthropic (Claude)");
    const deepseekIdx = out.indexOf("DeepSeek");
    expect(anthropicIdx).toBeGreaterThanOrEqual(0);
    expect(anthropicIdx).toBeLessThan(deepseekIdx);
    unmount();
  });

  test("the current model is marked with ●", () => {
    setProvider("deepseek");
    const { lastFrame, unmount } = render(<ModelPicker onCancel={() => {}} />);
    const out = lastFrame() ?? "";
    // The picker shows the readable label ("DeepSeek V4 Pro"), not the raw id.
    expect(out).toMatch(/●\s+DeepSeek V4 Pro/);
    unmount();
  });

  test("navigation skips headers: arrow down from first model reaches second model, not a header", () => {
    setProvider("deepseek");
    let selected: string | undefined;
    const onCancel = () => {};
    const { lastFrame, stdin, unmount } = render(<ModelPicker onCancel={onCancel} />);

    // DeepSeek has 2 models (deepseek-v4-pro, deepseek-v4-flash): from the first, down goes
    // to the second model (same provider), does not skip to the next provider.
    stdin.write(ARROW_DOWN);
    const out = lastFrame() ?? "";
    expect(out).toContain("DeepSeek V4 Flash");
    unmount();
  });

  test("Enter on the selected model applies provider+model and calls onCancel", async () => {
    setProvider("deepseek");
    let cancelled = false;
    const { stdin, unmount } = render(<ModelPicker onCancel={() => { cancelled = true; }} />);

    stdin.write(ARROW_DOWN); // -> deepseek-v4-flash
    // A tick to let React commit the useState update before the next
    // input: without it, the ENTER handler may still read the `idx` from the previous closure.
    await new Promise((r) => setTimeout(r, 0));
    stdin.write(ENTER);
    await new Promise((r) => setTimeout(r, 0));

    expect(cancelled).toBe(true);
    expect(currentModel()).toBe("deepseek-v4-flash");
    unmount();
  });

  test("no raw JSON or unrendered markup", () => {
    const { lastFrame, unmount } = render(<ModelPicker onCancel={() => {}} />);
    const out = lastFrame() ?? "";
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("[object");
    unmount();
  });

  test("scrolling past the initial window keeps the selection visible (regression: 10 providers overflow the terminal)", async () => {
    setProvider("deepseek");
    const { lastFrame, stdin, unmount } = render(<ModelPicker onCancel={() => {}} />);

    // 10 providers × their models is ~29 rows, well past what a real terminal
    // shows at once. Walk all the way to the last model (openrouter's second
    // entry, the last group in the list) and check it's still on screen —
    // before the windowing fix this row would silently scroll off with no
    // indication, leaving the highlight nowhere to be found.
    for (let i = 0; i < 18; i++) {
      stdin.write(ARROW_DOWN);
      await new Promise((r) => setTimeout(r, 0));
    }
    const out = lastFrame() ?? "";
    expect(out).toContain("Claude Opus 4.8 (via OpenRouter)");
    expect(out).toContain("more above");
    unmount();
  });
});
