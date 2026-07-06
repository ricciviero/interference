import { describe, test, expect, afterEach } from "bun:test";
import { dispatch } from "../commands/index.ts";
import { setProvider, resetModel, currentModel, currentProviderId } from "../config.ts";

afterEach(() => {
  resetModel();
  setProvider("deepseek");
});

describe("/model command", () => {
  test("`/model <id>` sets the model on the current provider", async () => {
    setProvider("anthropic");
    await dispatch("/model claude-sonnet-5", {});
    expect(currentProviderId()).toBe("anthropic"); // unchanged
    expect(currentModel()).toBe("claude-sonnet-5");
  });

  test("`/model <provider> <id>` switches both provider and model", async () => {
    setProvider("deepseek");
    const msg = await dispatch("/model openrouter anthropic/claude-opus-4-8", {});
    expect(currentProviderId()).toBe("openrouter");
    expect(currentModel()).toBe("anthropic/claude-opus-4-8");
    expect(msg).toContain("openrouter");
  });

  test("a slash-containing id without a known provider prefix is treated as a plain model id", async () => {
    setProvider("openrouter");
    // First token "meta-llama" is NOT a provider id → whole string is the model.
    await dispatch("/model meta-llama/llama-3.3-70b-instruct:free", {});
    expect(currentProviderId()).toBe("openrouter"); // unchanged
    expect(currentModel()).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });
});
