import { describe, test, expect, afterEach } from "bun:test";
import { resolveModel } from "../provider.ts";
import { cheapModelFor, currentModel, currentProvider, setModel, setProvider, resetModel, PROVIDERS } from "../config.ts";

const PREV_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PREV_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  resetModel();
  setProvider("deepseek");
  if (PREV_ANTHROPIC_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = PREV_ANTHROPIC_KEY;
  if (PREV_DEEPSEEK_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = PREV_DEEPSEEK_KEY;
});

describe("cheapModelFor (iter 31)", () => {
  test("returns the explicit cheapModel for each provider", () => {
    expect(cheapModelFor("deepseek")).toBe("deepseek-v4-flash");
    expect(cheapModelFor("anthropic")).toBe("claude-haiku-4-5");
    expect(cheapModelFor("kimi")).toBe("kimi-k2.5");
    expect(cheapModelFor("glm")).toBe("glm-5.2");
    expect(cheapModelFor("openai")).toBe("gpt-5.6-luna");
  });
});

describe("resolveModel(override) does not mutate global state (iter 31)", () => {
  test("override.model resolves the correct model without changing currentModel()", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    setProvider("deepseek");
    setModel("deepseek-v4-pro");

    // Async (it. 38): the @ai-sdk/* package is loaded with a dynamic import.
    const model = await resolveModel({ provider: "anthropic", model: "claude-haiku-4-5" });

    expect((model as unknown as { modelId: string }).modelId).toBe("claude-haiku-4-5");
    // Global state unchanged: the main thread stays on the user's model.
    expect(currentModel()).toBe("deepseek-v4-pro");
    expect(currentProvider().label).toBe("DeepSeek");
  });

  test("without override, resolveModel uses global state as before", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    setProvider("deepseek");
    setModel("deepseek-v4-flash");

    const model = await resolveModel();

    expect((model as unknown as { modelId: string }).modelId).toBe("deepseek-v4-flash");
  });
});

describe("dynamic provider loading (iter 38)", () => {
  const NEW_PROVIDERS = [
    { id: "google", envKey: "GOOGLE_API_KEY", model: "gemini-2.5-pro" },
    { id: "groq", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile" },
    { id: "xai", envKey: "XAI_API_KEY", model: "grok-4.3" },
    { id: "mistral", envKey: "MISTRAL_API_KEY", model: "mistral-large-latest" },
  ] as const;

  for (const { id, envKey, model: modelId } of NEW_PROVIDERS) {
    test(`${id}: resolveModel loads the package dynamically and instantiates the model`, async () => {
      const prevKey = process.env[envKey];
      process.env[envKey] = "test-key";
      try {
        const model = await resolveModel({ provider: id, model: modelId });
        expect((model as unknown as { modelId: string }).modelId).toBe(modelId);
      } finally {
        if (prevKey === undefined) delete process.env[envKey];
        else process.env[envKey] = prevKey;
      }
    });
  }

  test("openrouter (openai-compatible, no dedicated package): instantiates correctly", async () => {
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";
    try {
      const model = await resolveModel({ provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" });
      expect(model).toBeDefined();
    } finally {
      if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevKey;
    }
  });

  test("npm not mapped in BUNDLED_LOADERS: clear error, no raw stack trace", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const originalNpm = PROVIDERS.mistral.npm;
    PROVIDERS.mistral.npm = "@ai-sdk/questo-pacchetto-non-esiste-xyz";
    try {
      await expect(resolveModel({ provider: "mistral" })).rejects.toThrow(/not mapped/);
    } finally {
      PROVIDERS.mistral.npm = originalNpm;
      delete process.env.MISTRAL_API_KEY;
    }
  });

  test("provider without API key: clear MissingApiKeyError (unchanged behavior)", async () => {
    const prevKey = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      await expect(resolveModel({ provider: "google" })).rejects.toThrow(/GOOGLE_API_KEY/);
    } finally {
      if (prevKey !== undefined) process.env.GOOGLE_API_KEY = prevKey;
    }
  });
});
