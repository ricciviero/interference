// Configurazione centralizzata (RF-CORE-02/03). Letta da env / `.env` (Bun carica
// `.env` in automatico). Nessun segreto hardcoded: le API key arrivano da env.
//
// Multi-provider con REASONING/THINKING a livello selezionabile a runtime
// (`/thinking`). Il meccanismo differisce per provider:
//  - dedicati (anthropic/deepseek) → `providerOptions.<id>` passato a streamText
//  - openai-compatible (glm/kimi)  → campo `thinking` iniettato nel body (extraBody)
// `reasoningConfig()` traduce il livello corrente nelle opzioni giuste per provider.

export type ProviderId = "anthropic" | "deepseek" | "glm" | "kimi";

export type ProviderKind = "anthropic" | "deepseek" | "openai-compatible";

/** Livello di ragionamento unificato. I provider mappano sul proprio meccanismo. */
export type ThinkingLevel = "off" | "low" | "medium" | "high" | "max";

export interface ProviderDef {
  label: string;
  /** Nome della env var con la API key. */
  envKey: string;
  /** Model id di default (override con INTERFERENCE_MODEL). */
  defaultModel: string;
  kind: ProviderKind;
  /** Per kind "openai-compatible": baseURL ESATTO (non normalizzare). */
  baseURL?: string;
  /** Context window size in tokens (per compaction threshold). Default 200K. */
  contextLimit?: number;
  /** Livelli di thinking supportati (per /thinking). off = disabilitato. */
  thinkingLevels: ThinkingLevel[];
  /** Livello di default del provider. */
  defaultThinking: ThinkingLevel;
  /** Modelli conosciuti per questo provider (per /model picker). */
  models: { id: string; label: string }[];
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro",
    kind: "deepseek",
    contextLimit: 1_000_000,
    thinkingLevels: ["off", "low", "medium", "high", "max"],
    defaultThinking: "max",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (1M ctx)" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    ],
  },
  anthropic: {
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    kind: "anthropic",
    contextLimit: 200_000,
    thinkingLevels: ["off", "low", "medium", "high", "max"],
    defaultThinking: "high",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (200K ctx)" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    ],
  },
  glm: {
    label: "Zhipu GLM",
    envKey: "GLM_API_KEY",
    defaultModel: "glm-4.6",
    kind: "openai-compatible",
    contextLimit: 200_000,
    baseURL: "https://api.z.ai/api/paas/v4",
    thinkingLevels: ["off", "max"],
    defaultThinking: "max",
    models: [
      { id: "glm-4.6", label: "GLM-4.6 (200K ctx)" },
    ],
  },
  kimi: {
    label: "Moonshot Kimi",
    envKey: "KIMI_API_KEY",
    defaultModel: "kimi-k2.6",
    kind: "openai-compatible",
    contextLimit: 128_000,
    baseURL: "https://api.moonshot.ai/v1",
    thinkingLevels: ["off", "max"],
    defaultThinking: "max",
    models: [
      { id: "kimi-k2.6", label: "Kimi K2.6 (128K ctx)" },
    ],
  },
};

function parseProvider(raw: string | undefined): ProviderId {
  const id = (raw ?? "deepseek") as ProviderId;
  return id in PROVIDERS ? id : "deepseek";
}

export const config = {
  provider: parseProvider(process.env.INTERFERENCE_PROVIDER),
  /** Override esplicito del modello; se assente si usa il default del provider. */
  modelOverride: process.env.INTERFERENCE_MODEL,
};

/** Definizione del provider attualmente selezionato. */
export function currentProvider(): ProviderDef {
  return PROVIDERS[config.provider];
}

/** Model id effettivo (override runtime > env var > default del provider). */
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

let _mode: AgentMode = "plan";

export function currentMode(): AgentMode {
  return _mode;
}

export function setMode(mode: AgentMode) {
  _mode = mode;
}

// --- Thinking level (runtime, /thinking) ------------------------------------
let _thinking: ThinkingLevel | null = null;

/** Livello di thinking corrente (override runtime o default del provider). */
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

// Anthropic: livello → budget token del thinking (maxOutputTokens deve superarlo).
const ANTHROPIC_BUDGET: Record<Exclude<ThinkingLevel, "off">, number> = {
  low: 8_000,
  medium: 16_000,
  high: 32_000,
  max: 60_000,
};

/** Traduce il livello di thinking corrente nelle opzioni del provider attivo. */
export function reasoningConfig(): ReasoningConfig {
  const level = currentThinking();

  switch (config.provider) {
    case "deepseek":
      if (level === "off") {
        return { providerOptions: { deepseek: { thinking: { type: "disabled" } } } };
      }
      return {
        providerOptions: { deepseek: { thinking: { type: "enabled" }, reasoningEffort: level } },
      };

    case "anthropic": {
      if (level === "off") return {};
      const budget = ANTHROPIC_BUDGET[level];
      return {
        providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: budget } } },
        maxOutputTokens: budget + 8_000,
      };
    }

    case "glm":
      return { extraBody: { thinking: { type: level === "off" ? "disabled" : "enabled" } } };

    case "kimi":
      if (level === "off") return { extraBody: { thinking: { type: "disabled" } } };
      return { extraBody: { thinking: { type: "enabled", keep: "all" } } };
  }
}
