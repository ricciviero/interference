// Static snapshot of model metadata (it. 37), populated from models.dev/api.json
// (real fetch on 2026-07-01). Used ONLY when the remote catalog and the on-disk cache
// are unavailable (first offline run) — see catalog.ts. Covers the models
// currently configured in src/config.ts (PROVIDERS); not a full mirror of the
// catalog (which has ~150 providers). Identical format to models.dev (raw, snake_case) so
// it can be validated by the same zod schema as a live fetch.
//
// Note: the prices here do not update on their own. If models.dev is reachable, the
// live/cached catalog always takes priority (see loadCatalog()) — this file is only
// the safety net for offline use.
export const CATALOG_SNAPSHOT = {
  anthropic: {
    models: {
      "claude-sonnet-5": {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_000_000, output: 128_000 },
        cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
      },
      "claude-opus-4-8": {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_000_000, output: 128_000 },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
      "claude-sonnet-4-6": {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_000_000, output: 64_000 },
        cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      },
      "claude-haiku-4-5": {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5 (latest)",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 200_000, output: 64_000 },
        cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
      },
    },
  },
  deepseek: {
    models: {
      "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text"] },
        limit: { context: 1_000_000, output: 384_000 },
        cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
      },
      "deepseek-v4-flash": {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text"] },
        limit: { context: 1_000_000, output: 384_000 },
        cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
      },
    },
  },
  openai: {
    models: {
      "gpt-5.6": {
        id: "gpt-5.6",
        name: "GPT-5.6",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 5, output: 30, cache_read: 0.5, cache_write: 6.25 },
      },
      "gpt-5.6-sol": {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 5, output: 30, cache_read: 0.5, cache_write: 6.25 },
      },
      "gpt-5.6-terra": {
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 2.5, output: 15, cache_read: 0.25, cache_write: 3.125 },
      },
      "gpt-5.6-luna": {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 1, output: 6, cache_read: 0.1, cache_write: 1.25 },
      },
      "gpt-5.5": {
        id: "gpt-5.5",
        name: "GPT-5.5",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 5, output: 30, cache_read: 0.5 },
      },
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT-5.4",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 1_050_000, output: 128_000 },
        cost: { input: 2.5, output: 15, cache_read: 0.25 },
      },
    },
  },
  zhipuai: {
    models: {
      "glm-5.2": {
        id: "glm-5.2",
        name: "GLM-5.2",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text"] },
        limit: { context: 1_000_000, output: 131_072 },
        cost: { input: 1.4, output: 4.4, cache_read: 0.26, cache_write: 0 },
      },
    },
  },
  moonshotai: {
    models: {
      "kimi-k3": {
        id: "kimi-k3",
        name: "Kimi K3",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "video"] },
        limit: { context: 1_048_576, output: 131_072 },
        cost: { input: 3, output: 15, cache_read: 0.3 },
      },
      "kimi-k2.7-code": {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "video"] },
        limit: { context: 262_144, output: 262_144 },
        cost: { input: 0.95, output: 4, cache_read: 0.19 },
      },
      "kimi-k2.6": {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "video"] },
        limit: { context: 262_144, output: 262_144 },
        cost: { input: 0.95, output: 4, cache_read: 0.16 },
      },
      "kimi-k2.5": {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image", "video"] },
        limit: { context: 262_144, output: 262_144 },
        cost: { input: 0.6, output: 3, cache_read: 0.1 },
      },
    },
  },
} as const;
