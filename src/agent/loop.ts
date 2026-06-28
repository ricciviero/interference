// Agent loop minimo (RF-AGT, RF-CORE-04). In questa iterazione: una singola
// chiamata in streaming, senza tool, con REASONING/thinking abilitato al massimo
// per provider (opzioni da config.ts). Il multi-step con `stopWhen` e i tool
// arrivano nell'it. 02.
//
// Si consuma `fullStream` perché (a) in `streamText` gli errori NON vengono
// lanciati dal for-await ma arrivano come `part.type==='error'`, e (b) i token di
// reasoning arrivano come `part.type==='reasoning-delta'`, distinti dal testo.

import { streamText, type ModelMessage } from "ai";
import { resolveModel } from "../provider.ts";
import { currentProvider } from "../config.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

export type Chunk = { type: "text" | "reasoning"; text: string };

/**
 * Esegue un turno e produce i chunk (testo + reasoning). A fine turno accoda alla
 * history le response message (incluso il reasoning, necessario al round-trip su
 * alcuni provider). Solleva MissingApiKeyError o l'errore del provider.
 */
export async function* runTurn(
  messages: ModelMessage[],
  signal?: AbortSignal,
): AsyncGenerator<Chunk> {
  const def = currentProvider();
  const result = streamText({
    model: resolveModel(),
    system: SYSTEM_PROMPT,
    messages,
    abortSignal: signal,
    // L'onError di default di streamText fa console.error(error) (stack rumoroso):
    // lo silenziamo, l'errore arriva comunque come part 'error' qui sotto.
    onError: () => {},
    ...(def.providerOptions
      ? {
          providerOptions: def.providerOptions as Parameters<
            typeof streamText
          >[0]["providerOptions"],
        }
      : {}),
    ...(def.maxOutputTokens ? { maxOutputTokens: def.maxOutputTokens } : {}),
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      yield { type: "text", text: part.text };
    } else if (part.type === "reasoning-delta") {
      yield { type: "reasoning", text: part.text };
    } else if (part.type === "error") {
      throw part.error;
    }
  }

  // Round-trip: accoda le message dell'assistente (con reasoning) alla history.
  const response = await result.response;
  messages.push(...response.messages);
}
