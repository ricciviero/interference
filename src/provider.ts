// Astrazione provider (RF-CORE-03). Risolve un `LanguageModel` del Vercel AI SDK
// per il provider selezionato. Reasoning/thinking abilitato per ogni provider:
//  - anthropic/deepseek: via providerOptions (gestito nell'agent loop)
//  - glm/kimi (openai-compatible): il campo `thinking` viene iniettato nel body
//    con `transformRequestBody`; un middleware estrae eventuali <think> inline.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from "ai";
import { currentModel, currentProvider, reasoningConfig, type ProviderDef } from "./config.ts";

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderDef) {
    super(
      `${provider.label}: ${provider.envKey} non è impostata.\n` +
        `  Aggiungila al file .env (o esportala):  ${provider.envKey}=...`,
    );
    this.name = "MissingApiKeyError";
  }
}

/** Risolve il modello del provider selezionato. Solleva MissingApiKeyError se manca la key. */
export function resolveModel(): LanguageModel {
  const def = currentProvider();
  const apiKey = process.env[def.envKey];
  if (!apiKey) throw new MissingApiKeyError(def);

  const model = currentModel();

  switch (def.kind) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);

    case "deepseek":
      return createDeepSeek({ apiKey })(model);

    case "openai-compatible": {
      // Opzioni di thinking per il livello corrente (/thinking), calcolate ad ogni turno.
      const extraBody = reasoningConfig().extraBody;
      const provider = createOpenAICompatible({
        name: def.label,
        baseURL: def.baseURL ?? "",
        apiKey,
        // Inietta i campi non-OpenAI-standard (es. `thinking`) nel body grezzo.
        transformRequestBody: extraBody
          ? (body: Record<string, unknown>) => ({ ...body, ...extraBody })
          : undefined,
      });
      // Fallback: se il modello inlinea il reasoning tra <think>...</think>, estrailo
      // come reasoning (per chi manda reasoning_content separato è un no-op).
      return wrapLanguageModel({
        model: provider(model),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    }
  }
}
