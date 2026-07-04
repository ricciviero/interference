// Centralized configuration (RF-CORE-02/03). Read from env / `.env` (Bun loads
// `.env` automatically). No hardcoded secrets: API keys come from env.
//
// Multi-provider with REASONING/THINKING level selectable at runtime
// (`/thinking`). The mechanism differs by provider:
//  - dedicated (anthropic/deepseek) → `providerOptions.<id>` passed to streamText
//  - openai-compatible (glm/kimi)  → `thinking` field injected in the body (extraBody)
// `reasoningConfig()` translates the current level into the right options per provider.

export type ProviderId =
  | "anthropic"
  | "deepseek"
  | "openai"
  | "glm"
  | "kimi"
  | "google"
  | "groq"
  | "xai"
  | "mistral"
  | "openrouter";

// "native": dedicated SDK with the same simple pattern as anthropic/deepseek
// (createX({apiKey})(model)), but without custom reasoning/extraBody handling — used for
// the providers added in it. 38 (Google/Groq/xAI/Mistral) until a specific need for
// reasoning control emerges for them.
export type ProviderKind = "anthropic" | "deepseek" | "openai-compatible" | "native";

/** Unified reasoning level. Providers map to their own mechanism. */
export type ThinkingLevel = "off" | "low" | "medium" | "high" | "max";

export interface ProviderDef {
  label: string;
  /** Name of the env var holding the API key. */
  envKey: string;
  /** Default model id (override with INTERFERENCE_MODEL). */
  defaultModel: string;
  kind: ProviderKind;
  /** @ai-sdk/* package from which to load the factory (dynamic import, it. 38). */
  npm: string;
  /** For kind "openai-compatible": EXACT baseURL (do not normalize). */
  baseURL?: string;
  /** Context window size in tokens (for compaction threshold). Default 200K. */
  contextLimit?: number;
  /** Supported thinking levels (for /thinking). off = disabled. */
  thinkingLevels: ThinkingLevel[];
  /** Default thinking level for this provider. */
  defaultThinking: ThinkingLevel;
  /** Known models for this provider (for /model picker). */
  models: { id: string; label: string }[];
  /** Cheap model for subagent/internal tasks (compaction). Fallback: defaultModel. */
  cheapModel?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro",
    kind: "deepseek",
    npm: "@ai-sdk/deepseek",
    contextLimit: 1_000_000,
    thinkingLevels: ["off", "low", "medium", "high", "max"],
    defaultThinking: "max",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (1M ctx)" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    ],
    cheapModel: "deepseek-v4-flash",
  },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5.5",
    kind: "openai-compatible",
    npm: "@ai-sdk/openai-compatible",
    baseURL: "https://api.openai.com/v1",
    contextLimit: 1_000_000,
    thinkingLevels: ["off", "low", "medium", "high", "max"],
    defaultThinking: "high",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5 (1M ctx)" },
      { id: "gpt-5.4", label: "GPT-5.4 (1M ctx)" },
    ],
    cheapModel: "gpt-5.4",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-4-8",
    kind: "anthropic",
    npm: "@ai-sdk/anthropic",
    contextLimit: 1_000_000,
    thinkingLevels: ["off", "low", "medium", "high", "max"],
    defaultThinking: "high",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 (1M ctx)" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8 (1M ctx)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (1M ctx)" },
    ],
    cheapModel: "claude-haiku-4-5",
  },
  glm: {
    label: "Zhipu GLM",
    envKey: "GLM_API_KEY",
    defaultModel: "glm-5.2",
    kind: "openai-compatible",
    npm: "@ai-sdk/openai-compatible",
    contextLimit: 1_000_000,
    baseURL: "https://api.z.ai/api/paas/v4",
    thinkingLevels: ["off", "max"],
    defaultThinking: "max",
    models: [
      { id: "glm-5.2", label: "GLM-5.2 (1M ctx)" },
    ],
    // No known "flash" variant for GLM: cheapModel is the same as default.
    cheapModel: "glm-5.2",
  },
  kimi: {
    label: "Moonshot Kimi",
    envKey: "KIMI_API_KEY",
    defaultModel: "kimi-k2.7-code",
    kind: "openai-compatible",
    npm: "@ai-sdk/openai-compatible",
    contextLimit: 1_000_000,
    baseURL: "https://api.moonshot.ai/v1",
    thinkingLevels: ["off", "max"],
    defaultThinking: "max",
    models: [
      { id: "kimi-k2.7-code", label: "Kimi K2.7 Code (thinking always on)" },
      { id: "kimi-k2.6", label: "Kimi K2.6 (thinking opzionale)" },
      { id: "kimi-k2.5", label: "Kimi K2.5" },
    ],
    cheapModel: "kimi-k2.5",
  },

  // --- Providers added in it. 38 (dynamic provider loading) ------------------
  // No hardcoded contextLimit: provided by the catalog (it. 37); fallback to
  // DEFAULT_CONTEXT (200K) in compaction.ts if the catalog lacks the id.
  // thinkingLevels: ["off"] = no reasoning lever implemented for these providers
  // (reasoningConfig() always returns {} for them, default model behavior) — honest
  // toward the user, doesn't fake a control that doesn't exist yet.
  google: {
    label: "Google (Gemini)",
    envKey: "GOOGLE_API_KEY",
    defaultModel: "gemini-2.5-pro",
    kind: "native",
    npm: "@ai-sdk/google",
    thinkingLevels: ["off"],
    defaultThinking: "off",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    cheapModel: "gemini-2.5-flash",
  },
  groq: {
    label: "Groq",
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    kind: "native",
    npm: "@ai-sdk/groq",
    thinkingLevels: ["off"],
    defaultThinking: "off",
    models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" }],
  },
  xai: {
    label: "xAI (Grok)",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-4.3",
    kind: "native",
    npm: "@ai-sdk/xai",
    thinkingLevels: ["off"],
    defaultThinking: "off",
    models: [{ id: "grok-4.3", label: "Grok 4.3" }],
  },
  mistral: {
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    kind: "native",
    npm: "@ai-sdk/mistral",
    thinkingLevels: ["off"],
    defaultThinking: "off",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "codestral-latest", label: "Codestral (coding)" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    // OpenRouter exposes a drop-in OpenAI-compatible API — no dedicated package/kind.
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    kind: "openai-compatible",
    npm: "@ai-sdk/openai-compatible",
    baseURL: "https://openrouter.ai/api/v1",
    thinkingLevels: ["off"],
    defaultThinking: "off",
    // OpenRouter is an aggregator for hundreds of third-party models: the user can always
    // write `/model <exact-id>` (e.g. "anthropic/claude-opus-4-8") beyond these examples.
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8 (via OpenRouter)" },
    ],
  },
};

/** Cheap model for the given provider (for subagent/internal tasks). Fallback: defaultModel. */
export function cheapModelFor(providerId: ProviderId): string {
  const def = PROVIDERS[providerId];
  return def.cheapModel ?? def.defaultModel;
}

function parseProvider(raw: string | undefined): ProviderId {
  const id = (raw ?? "deepseek") as ProviderId;
  return id in PROVIDERS ? id : "deepseek";
}

export const config = {
  provider: parseProvider(process.env.INTERFERENCE_PROVIDER),
  /** Explicit model override; if absent, the provider default is used. */
  modelOverride: process.env.INTERFERENCE_MODEL,
};

// --- Agent loop budget (fix/09) --------------------------------------------
// The old hardcoded `stepCountIs(20)` cap silently truncated long multi-step tasks
// (the agent "stopped mid-task" no matter what the prompt said). Now the per-call
// step budget and the number of automatic continuations are configurable. Total
// ceiling = maxSteps × maxContinuations (high but bounded; Esc always aborts).
const DEFAULT_MAX_STEPS = 100;
const DEFAULT_MAX_CONTINUATIONS = 25;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max steps in a single streamText call (env INTERFERENCE_MAX_STEPS or interference.json). */
export function maxStepsPerCall(): number {
  return parsePositiveInt(process.env.INTERFERENCE_MAX_STEPS, DEFAULT_MAX_STEPS);
}

/** Max automatic continuations of a single turn (runaway backstop). */
export function maxContinuations(): number {
  return parsePositiveInt(process.env.INTERFERENCE_MAX_CONTINUATIONS, DEFAULT_MAX_CONTINUATIONS);
}

/** Definition of the currently selected provider (runtime override > env var > default). */
let _providerOverride: ProviderId | null = null;

/** Effective provider id (runtime override `/provider` > env var > default). */
export function currentProviderId(): ProviderId {
  return (_providerOverride ?? config.provider) as ProviderId;
}

export function currentProvider(): ProviderDef {
  return PROVIDERS[currentProviderId()] ?? PROVIDERS.deepseek;
}

export function setProvider(providerId: ProviderId) {
  _providerOverride = providerId;
}

/** Effective model id (runtime override > env var > provider default). */
let _modelOverride: string | null = null;

export function currentModel(): string {
  return _modelOverride ?? config.modelOverride ?? currentProvider().defaultModel;
}

export function setModel(modelId: string) {
  _modelOverride = modelId;
}

export function resetModel() {
  _modelOverride = null;
}

// --- Mode (Plan/Build) ------------------------------------------------------
export type AgentMode = "plan" | "build";

let _mode: AgentMode = "build";

export function currentMode(): AgentMode {
  return _mode;
}

export function setMode(mode: AgentMode) {
  _mode = mode;
}

// --- Thinking level (runtime, /thinking) ------------------------------------
let _thinking: ThinkingLevel | null = null;

/** Current thinking level (runtime override or provider default). */
export function currentThinking(): ThinkingLevel {
  return _thinking ?? currentProvider().defaultThinking;
}

export function setThinking(level: ThinkingLevel) {
  _thinking = level;
}

export interface ReasoningConfig {
  providerOptions?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
  maxOutputTokens?: number;
}

/** Explicit override for computing the reasoning config of a provider/model different from the
 *  current one (used by cheap subagents, it. 31), without mutating global state. */
export interface ReasoningOverride {
  providerId?: ProviderId;
  model?: string;
  level?: ThinkingLevel;
}

/** Translates the thinking level (current, or passed via override) into provider options. */
export function reasoningConfig(override?: ReasoningOverride): ReasoningConfig {
  const level = override?.level ?? currentThinking();
  const providerId = override?.providerId ?? currentProviderId();
  const model = override?.model ?? currentModel();

  switch (providerId) {
    case "deepseek":
      if (level === "off") {
        return { providerOptions: { deepseek: { thinking: { type: "disabled" } } } };
      }
      return {
        providerOptions: { deepseek: { thinking: { type: "enabled" }, reasoningEffort: level } },
      };

    case "anthropic": {
      // Haiku (and Sonnet 4.5/earlier) does NOT support `thinking.type:"adaptive"` nor the
      // `effort` param (400 "adaptive thinking is not supported on this model") — unlike
      // Opus 4.6+/Sonnet 4.6+/Fable 5. Discovered when testing subagents on
      // cheapModel:"claude-haiku-4-5" (it. 31/34): plain call, no providerOptions.
      if (model.includes("haiku")) {
        return {};
      }
      // Modern Anthropic models (Sonnet 5, Opus 4.8/4.7, Fable 5) do NOT support
      // `thinking.type: "enabled"` (→ HTTP 400): use adaptive thinking + effort instead.
      // `off` → only low effort (no adaptive): the model stays fast/cheap.
      // (Without sending effort, the server default is `high` → "off" would not disable anything.)
      if (level === "off") {
        return { providerOptions: { anthropic: { effort: "low" } } };
      }
      // display:"summarized" makes the reasoning visible (it's omitted by default).
      return {
        providerOptions: {
          anthropic: { thinking: { type: "adaptive", display: "summarized" }, effort: level },
        },
      };
    }

    case "openai":
    case "glm":
      return { extraBody: { thinking: { type: level === "off" ? "disabled" : "enabled" } } };

    case "kimi": {
      // Moonshot reasoning (`reasoning_content` field, read natively by @ai-sdk/openai-compatible).
      // max_tokens ≥ 16000 required: the sum of reasoning+content must not exceed max_tokens.
      // `*-code` models have thinking ALWAYS ON and do NOT accept the `thinking` param.
      const alwaysOn = model.includes("k2.7-code");
      if (alwaysOn) return { maxOutputTokens: 16_000 };
      if (level === "off")
        return { extraBody: { thinking: { type: "disabled" } }, maxOutputTokens: 16_000 };
      return { extraBody: { thinking: { type: "enabled", keep: "all" } }, maxOutputTokens: 16_000 };
    }

    case "openrouter":
      // OpenAI-compatible but without a reasoning mechanism known/documented by us:
      // no custom extraBody (default behavior of the model chosen via OpenRouter).
      return {};

    case "google":
    case "groq":
    case "xai":
    case "mistral":
      // No reasoning lever implemented for these providers (it. 38) — thinkingLevels
      // is ["off"] in their ProviderDef, consistent with the empty return here.
      return {};
  }
}
