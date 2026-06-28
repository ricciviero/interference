// Configurazione centralizzata (RF-CORE-02/03). Letta da env / `.env` (Bun carica
// `.env` in automatico). Nessun segreto hardcoded: le API key arrivano da env.
//
// Multi-provider con REASONING/THINKING attivo al massimo per ogni provider
// (meccanismo diverso per provider):
//  - dedicati (anthropic/deepseek) → `providerOptions.<id>` passato a streamText
//  - openai-compatible (glm/kimi)  → campo `thinking` iniettato nel body (extraBody)

export type ProviderId = "anthropic" | "deepseek" | "glm" | "kimi";

export type ProviderKind = "anthropic" | "deepseek" | "openai-compatible";

export interface ProviderDef {
  label: string;
  /** Nome della env var con la API key. */
  envKey: string;
  /** Model id di default (override con INTERFERENCE_MODEL). */
  defaultModel: string;
  kind: ProviderKind;
  /** Per kind "openai-compatible": baseURL ESATTO (non normalizzare). */
  baseURL?: string;
  /** providerOptions per streamText (provider dedicati: anthropic/deepseek). */
  providerOptions?: Record<string, unknown>;
  /** Body params extra per openai-compatible (es. thinking) — glm/kimi. */
  extraBody?: Record<string, unknown>;
  /** Tetto output token (serve quando il reasoning ha un budget, es. Anthropic). */
  maxOutputTokens?: number;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro", // 1M ctx, reasoning
    kind: "deepseek",
    // Reasoning al massimo: thinking ON + effort max.
    providerOptions: {
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "max" },
    },
  },
  anthropic: {
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6", // model-id / pricing → skill claude-api
    kind: "anthropic",
    // Extended thinking (regime 4.x classico): budget alto, maxOutputTokens > budget.
    providerOptions: {
      anthropic: { thinking: { type: "enabled", budgetTokens: 32000 } },
    },
    maxOutputTokens: 64000,
  },
  glm: {
    label: "Zhipu GLM",
    envKey: "GLM_API_KEY",
    defaultModel: "glm-4.6", // 200K ctx
    kind: "openai-compatible",
    baseURL: "https://api.z.ai/api/paas/v4", // path /api/paas/v4, NON /v1
    extraBody: { thinking: { type: "enabled" } },
  },
  kimi: {
    label: "Moonshot Kimi",
    envKey: "KIMI_API_KEY",
    defaultModel: "kimi-k2.6",
    kind: "openai-compatible",
    baseURL: "https://api.moonshot.ai/v1",
    extraBody: { thinking: { type: "enabled", keep: "all" } },
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

/** Model id effettivo (override o default del provider). */
export function currentModel(): string {
  return config.modelOverride ?? currentProvider().defaultModel;
}

export type AgentMode = "plan" | "build";

let _mode: AgentMode = "plan";

export function currentMode(): AgentMode {
  return _mode;
}

export function setMode(mode: AgentMode) {
  _mode = mode;
}
