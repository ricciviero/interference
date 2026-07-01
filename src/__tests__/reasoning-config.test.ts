import { describe, test, expect } from "bun:test";
import { reasoningConfig } from "../config.ts";

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
