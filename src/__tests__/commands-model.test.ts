import { describe, test, expect, afterEach } from "bun:test";
import { dispatch } from "../commands/index.ts";
import {
  setProvider,
  setModel,
  resetModel,
  currentModel,
  currentProviderId,
  currentThinking,
  resetThinking,
} from "../config.ts";

afterEach(() => {
  resetModel();
  resetThinking();
  setProvider("deepseek");
});

describe("/thinking command — model-specific OpenAI levels", () => {
  test("GPT-5.6 accepts none, xhigh and max", async () => {
    setProvider("openai");
    setModel("gpt-5.6");

    expect(await dispatch("/thinking none", {})).toContain("'none'");
    expect(currentThinking()).toBe("none");
    expect(await dispatch("/thinking xhigh", {})).toContain("'xhigh'");
    expect(currentThinking()).toBe("xhigh");
    expect(await dispatch("/thinking max", {})).toContain("'max'");
    expect(currentThinking()).toBe("max");
  });

  test("GPT-5.5 rejects max but accepts xhigh", async () => {
    setProvider("openai");
    setModel("gpt-5.5");

    const rejected = await dispatch("/thinking max", {});
    expect(rejected).toContain("Invalid level 'max'");
    expect(rejected).toContain("xhigh");

    expect(await dispatch("/thinking xhigh", {})).toContain("'xhigh'");
    expect(currentThinking()).toBe("xhigh");
  });

  test("status lists levels for the active model, not the whole provider", async () => {
    setProvider("openai");
    setModel("gpt-5.4");
    const status = await dispatch("/thinking", {});
    expect(status).toContain("model: gpt-5.4");
    expect(status).toContain("none, low, medium, high, xhigh");
    expect(status).not.toContain("xhigh, max");
  });
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
