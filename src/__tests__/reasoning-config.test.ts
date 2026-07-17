import { describe, test, expect } from "bun:test";
import { reasoningConfig, thinkingLevelsFor, type ThinkingLevel } from "../config.ts";

describe("reasoningConfig — OpenAI GPT-5.6 model-specific effort", () => {
  test.each(["none", "low", "medium", "high", "xhigh", "max"] as const)(
    "gpt-5.6 sends reasoning_effort:%s",
    (level) => {
      const cfg = reasoningConfig({ providerId: "openai", model: "gpt-5.6", level });
      expect(cfg.extraBody).toEqual({ reasoning_effort: level });
    },
  );

  test("legacy off maps to OpenAI's none spelling", () => {
    const cfg = reasoningConfig({ providerId: "openai", model: "gpt-5.6-luna", level: "off" });
    expect(cfg.extraBody).toEqual({ reasoning_effort: "none" });
  });

  test("older GPT-5.5 does not receive unsupported max", () => {
    const cfg = reasoningConfig({ providerId: "openai", model: "gpt-5.5", level: "max" });
    expect(cfg.extraBody).toEqual({ reasoning_effort: "high" });
    expect(thinkingLevelsFor("openai", "gpt-5.5")).not.toContain("max");
  });

  test("all GPT-5.6 tiers expose none through max", () => {
    const expected: ThinkingLevel[] = ["none", "low", "medium", "high", "xhigh", "max"];
    for (const model of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(thinkingLevelsFor("openai", model)).toEqual(expected);
    }
  });
});

describe("reasoningConfig — Kimi K3", () => {
  test("exposes only max reasoning", () => {
    expect(thinkingLevelsFor("kimi", "kimi-k3")).toEqual(["max"]);
  });

  test.each(["off", "low", "max"] as const)(
    "normalizes %s to K3's only supported reasoning_effort:max",
    (level) => {
      const cfg = reasoningConfig({ providerId: "kimi", model: "kimi-k3", level });
      expect(cfg).toEqual({ extraBody: { reasoning_effort: "max" } });
      expect(cfg.maxOutputTokens).toBeUndefined();
    },
  );

  test("does not change the legacy K2 request contract", () => {
    const cfg = reasoningConfig({ providerId: "kimi", model: "kimi-k2.6", level: "max" });
    expect(cfg).toEqual({
      extraBody: { thinking: { type: "enabled", keep: "all" } },
      maxOutputTokens: 16_000,
    });
  });
});

describe("reasoningConfig (regression: haiku does not support adaptive/effort)", () => {
  test("claude-haiku-4-5 does NOT receive providerOptions (vanilla call)", () => {
    // Real bug found in E2E (it. 34): the cheap Anthropic subagent (cheapModel =
    // claude-haiku-4-5) failed with 400 "adaptive thinking is not supported on this model"
    // because reasoningConfig always sent thinking:adaptive+effort, not supported by Haiku.
    const cfg = reasoningConfig({ providerId: "anthropic", model: "claude-haiku-4-5", level: "low" });
    expect(cfg.providerOptions).toBeUndefined();

    const cfgOff = reasoningConfig({ providerId: "anthropic", model: "claude-haiku-4-5", level: "off" });
    expect(cfgOff.providerOptions).toBeUndefined();
  });

  test("claude-opus-4-8 receives adaptive thinking + effort (unchanged behavior)", () => {
    const cfg = reasoningConfig({ providerId: "anthropic", model: "claude-opus-4-8", level: "high" });
    expect(cfg.providerOptions).toEqual({
      anthropic: { thinking: { type: "adaptive", display: "summarized" }, effort: "high" },
    });
  });

  test("claude-opus-4-8 with level off only sends effort low (unchanged behavior)", () => {
    const cfg = reasoningConfig({ providerId: "anthropic", model: "claude-opus-4-8", level: "off" });
    expect(cfg.providerOptions).toEqual({ anthropic: { effort: "low" } });
  });
});

describe("reasoningConfig — OpenRouter (unified `reasoning.effort`)", () => {
  test("off sends nothing (model default applies)", () => {
    const cfg = reasoningConfig({ providerId: "openrouter", model: "deepseek/deepseek-v4-pro", level: "off" });
    expect(cfg.extraBody).toBeUndefined();
    expect(cfg.providerOptions).toBeUndefined();
  });

  test("high maps to reasoning.effort:high (OpenRouter's ceiling)", () => {
    const cfg = reasoningConfig({ providerId: "openrouter", model: "deepseek/deepseek-v4-pro", level: "high" });
    expect(cfg.extraBody).toEqual({ reasoning: { effort: "high" } });
  });

  test("medium maps to reasoning.effort:medium", () => {
    const cfg = reasoningConfig({ providerId: "openrouter", model: "openai/gpt-5.5", level: "medium" });
    expect(cfg.extraBody).toEqual({ reasoning: { effort: "medium" } });
  });

  test("max is clamped to high — OpenRouter does not expose a provider's proprietary 'max'", () => {
    // Verified against OpenRouter /models: deepseek models advertise only ["reasoning",
    // "include_reasoning"] — no reasoning_effort / "max". The native max is reachable only
    // via the direct DeepSeek provider.
    const cfg = reasoningConfig({ providerId: "openrouter", model: "deepseek/deepseek-v4-pro", level: "max" });
    expect(cfg.extraBody).toEqual({ reasoning: { effort: "high" } });
  });
});
