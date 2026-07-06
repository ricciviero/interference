import { describe, test, expect, afterEach } from "bun:test";
import {
  parseOpenRouterModels,
  getOpenRouterModelInfo,
  _seedOpenRouterForTests,
  _resetOpenRouterForTests,
} from "../openrouter.ts";

afterEach(() => {
  _resetOpenRouterForTests();
});

describe("parseOpenRouterModels", () => {
  const sample = {
    data: [
      {
        id: "anthropic/claude-opus-4-8",
        name: "Anthropic: Claude Opus 4.8",
        context_length: 200000,
        pricing: { prompt: "0.000005", completion: "0.000025" },
        supported_parameters: ["tools", "reasoning", "temperature"],
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        name: "Llama 3.3 70B (free)",
        context_length: 131072,
        pricing: { prompt: "0", completion: "0" },
        supported_parameters: ["temperature"],
      },
    ],
  };

  test("converts per-token USD strings to per-1M prices", () => {
    const models = parseOpenRouterModels(sample);
    const opus = models.find((m) => m.id === "anthropic/claude-opus-4-8")!;
    expect(opus.inputPer1M).toBeCloseTo(5.0, 6); // 0.000005 * 1e6
    expect(opus.outputPer1M).toBeCloseTo(25.0, 6); // 0.000025 * 1e6
  });

  test("free model prices resolve to 0", () => {
    const models = parseOpenRouterModels(sample);
    const free = models.find((m) => m.id.includes("llama"))!;
    expect(free.inputPer1M).toBe(0);
    expect(free.outputPer1M).toBe(0);
  });

  test("detects tool-call and reasoning from supported_parameters", () => {
    const models = parseOpenRouterModels(sample);
    const opus = models.find((m) => m.id === "anthropic/claude-opus-4-8")!;
    expect(opus.toolCall).toBe(true);
    expect(opus.reasoning).toBe(true);
    const free = models.find((m) => m.id.includes("llama"))!;
    expect(free.toolCall).toBe(false);
    expect(free.reasoning).toBe(false);
  });

  test("carries context_length and name", () => {
    const models = parseOpenRouterModels(sample);
    const opus = models.find((m) => m.id === "anthropic/claude-opus-4-8")!;
    expect(opus.contextLimit).toBe(200000);
    expect(opus.name).toBe("Anthropic: Claude Opus 4.8");
  });

  test("tolerates missing optional fields (name/pricing/context/params)", () => {
    const models = parseOpenRouterModels({ data: [{ id: "x/y" }] });
    expect(models).toHaveLength(1);
    expect(models[0]).toEqual({
      id: "x/y",
      name: "x/y", // falls back to id
      contextLimit: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      toolCall: false,
      reasoning: false,
    });
  });

  test("recognizes include_reasoning as a reasoning capability", () => {
    const models = parseOpenRouterModels({
      data: [{ id: "a/b", supported_parameters: ["include_reasoning"] }],
    });
    expect(models[0]!.reasoning).toBe(true);
  });
});

describe("getOpenRouterModelInfo", () => {
  test("returns undefined when nothing is loaded", () => {
    expect(getOpenRouterModelInfo("anything")).toBeUndefined();
  });

  test("looks up a seeded model by id", () => {
    _seedOpenRouterForTests([
      { id: "a/b", name: "A B", contextLimit: 1000, inputPer1M: 1, outputPer1M: 2, toolCall: true, reasoning: false },
    ]);
    expect(getOpenRouterModelInfo("a/b")?.contextLimit).toBe(1000);
    expect(getOpenRouterModelInfo("missing")).toBeUndefined();
  });
});
