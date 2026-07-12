// Provider abstraction (RF-CORE-03). Resolves a `LanguageModel` from the Vercel AI SDK
// for the selected provider. Reasoning/thinking enabled per provider:
//  - anthropic/deepseek: via providerOptions (handled in the agent loop)
//  - openai/glm/kimi/openrouter (openai-compatible): provider-specific reasoning fields are
//    injected into the body with `transformRequestBody`; a middleware extracts inline <think> tags.
//  - google/groq/xai/mistral (native, it. 38): no custom reasoning handling.
//
// @ai-sdk/* packages are loaded via DYNAMIC IMPORTS (it. 38, fetch + on-disk cache with TTL
// + embedded snapshot pattern for offline/first-run without network): a new provider is
// added with an entry in BUNDLED_LOADERS + PROVIDERS (config.ts), without static imports
// to maintain here.

import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from "ai";
import {
  currentModel,
  currentProvider,
  currentProviderId,
  PROVIDERS,
  reasoningConfig,
  type ProviderDef,
  type ProviderId,
  type ThinkingLevel,
} from "./config.ts";

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderDef) {
    super(
      `${provider.label}: ${provider.envKey} is not set.\n` +
        `  Add it to the .env file (or export it):  ${provider.envKey}=...`,
    );
    this.name = "MissingApiKeyError";
  }
}

/** Explicit override of provider/model/thinking, used by cheap subagents (it. 31)
 *  to run on a different model WITHOUT mutating global state (the main thread
 *  stays on the user-chosen model). */
export interface ModelOverride {
  model?: string;
  provider?: ProviderId;
  thinkingLevel?: ThinkingLevel;
}

// Each loader dynamically imports the package and extracts the `create*` factory. The real
// signatures are heterogeneous across SDKs (different required opts, own generics) — too
// divergent for a common type without friction; typed broadly (`any`) here and narrowed
// back to `LanguageModel` (resolveModel's public type) only at the final return point.
type ProviderFactory = (opts: any) => (model: string) => any;

const BUNDLED_LOADERS: Record<string, () => Promise<ProviderFactory>> = {
  "@ai-sdk/anthropic": () => import("@ai-sdk/anthropic").then((m) => m.createAnthropic),
  "@ai-sdk/deepseek": () => import("@ai-sdk/deepseek").then((m) => m.createDeepSeek),
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
  "@ai-sdk/google": () => import("@ai-sdk/google").then((m) => m.createGoogle),
  "@ai-sdk/groq": () => import("@ai-sdk/groq").then((m) => m.createGroq),
  "@ai-sdk/xai": () => import("@ai-sdk/xai").then((m) => m.createXai),
  "@ai-sdk/mistral": () => import("@ai-sdk/mistral").then((m) => m.createMistral),
};

async function loadFactory(def: ProviderDef): Promise<ProviderFactory> {
  const loader = BUNDLED_LOADERS[def.npm];
  if (!loader) {
    throw new Error(`Provider ${def.label}: package "${def.npm}" not mapped in provider.ts.`);
  }
  try {
    return await loader();
  } catch {
    throw new Error(
      `Provider ${def.label} requires the package "${def.npm}", not installed.\n` +
        `  Add it with: bun add ${def.npm}`,
    );
  }
}

/** Resolves the model for the selected provider (or override). Throws MissingApiKeyError
 *  if the key is missing, or a clear error (no raw stack trace) if the SDK package
 *  is not installed. Async: the package is loaded on-demand (dynamic import, it. 38). */
export async function resolveModel(override?: ModelOverride): Promise<LanguageModel> {
  const def = override?.provider ? PROVIDERS[override.provider] : currentProvider();
  const apiKey = process.env[def.envKey];
  if (!apiKey) throw new MissingApiKeyError(def);

  const model = override?.model ?? currentModel();
  const factory = await loadFactory(def);

  switch (def.kind) {
    case "anthropic":
    case "deepseek":
    case "native":
      return factory({ apiKey })(model) as LanguageModel;

    case "openai-compatible": {
      // Thinking options for the current level (/thinking) or override, recomputed each turn.
      const extraBody = reasoningConfig({
        providerId: override?.provider ?? currentProviderId(),
        model,
        level: override?.thinkingLevel,
      }).extraBody;
      const provider = factory({
        name: def.label,
        baseURL: def.baseURL ?? "",
        apiKey,
        // Extra headers (e.g. OpenRouter ranking headers) sent on every request.
        headers: def.headers,
        // Inject provider-specific fields (e.g. OpenAI `reasoning_effort`, GLM/Kimi `thinking`)
        // into the raw body.
        transformRequestBody: extraBody
          ? (body: Record<string, unknown>) => ({ ...body, ...extraBody })
          : undefined,
      });
      // Fallback: if the model inlines reasoning in <think>...</think>, extract it
      // as reasoning (for those that send reasoning_content separately it's a no-op).
      return wrapLanguageModel({
        model: provider(model),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      }) as LanguageModel;
    }
  }
}
