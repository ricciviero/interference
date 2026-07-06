import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ModelPicker } from "../ModelPicker.tsx";
import { setProvider, resetModel, currentModel, currentProviderId } from "../../config.ts";
import { _seedOpenRouterForTests, _resetOpenRouterForTests, type OpenRouterModel } from "../../openrouter.ts";

const ARROW_DOWN = "[B";
const ENTER = "\r";

const tick = () => new Promise((r) => setTimeout(r, 0));

// Seed the OpenRouter in-memory cache to EMPTY so the picker's useEffect resolves without a
// real network fetch (deterministic, offline) and falls back to the curated OpenRouter entries.
beforeEach(() => {
  _seedOpenRouterForTests([]);
});

afterEach(() => {
  resetModel();
  setProvider("deepseek");
  _resetOpenRouterForTests();
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

describe("ModelPicker filtering (OpenRouter dynamic catalog)", () => {
  const OR: OpenRouterModel[] = [
    { id: "anthropic/claude-opus-4-8", name: "Claude Opus", contextLimit: 200000, inputPer1M: 5, outputPer1M: 25, toolCall: true, reasoning: true },
    { id: "openai/gpt-5.5", name: "GPT-5.5", contextLimit: 400000, inputPer1M: 5, outputPer1M: 30, toolCall: true, reasoning: false },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3", contextLimit: 131072, inputPer1M: 0, outputPer1M: 0, toolCall: false, reasoning: false },
  ];

  test("loads the dynamic OpenRouter catalog (raw ids) into the list", async () => {
    setProvider("openrouter");
    _seedOpenRouterForTests(OR);
    const { lastFrame, unmount } = render(<ModelPicker onCancel={() => {}} />);
    await tick(); // let the useEffect commit the loaded list
    const out = lastFrame() ?? "";
    expect(out).toContain("meta-llama/llama-3.3-70b-instruct:free");
    unmount();
  });

  test("typing narrows the list in real time", async () => {
    setProvider("openrouter");
    _seedOpenRouterForTests(OR);
    const { lastFrame, stdin, unmount } = render(<ModelPicker onCancel={() => {}} />);
    await tick();
    stdin.write("gpt");
    await tick();
    const out = lastFrame() ?? "";
    expect(out).toContain("openai/gpt-5.5");
    expect(out).not.toContain("llama-3.3-70b");
    expect(out).toContain("Filter: gpt");
    unmount();
  });

  test("a filter with no matches shows an explicit empty state", async () => {
    setProvider("openrouter");
    _seedOpenRouterForTests(OR);
    const { lastFrame, stdin, unmount } = render(<ModelPicker onCancel={() => {}} />);
    await tick();
    stdin.write("zzzznope");
    await tick();
    const out = lastFrame() ?? "";
    expect(out).toContain("No models match");
    unmount();
  });

  test("Enter on a filtered OpenRouter model switches provider+model", async () => {
    setProvider("deepseek"); // start elsewhere: selecting an OR model must switch provider
    _seedOpenRouterForTests(OR);
    let cancelled = false;
    const { stdin, unmount } = render(<ModelPicker onCancel={() => { cancelled = true; }} />);
    await tick();
    stdin.write("openai/gpt"); // matches only the OpenRouter id, not curated "gpt-5.5"
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(cancelled).toBe(true);
    expect(currentProviderId()).toBe("openrouter");
    expect(currentModel()).toBe("openai/gpt-5.5");
    unmount();
  });
});
