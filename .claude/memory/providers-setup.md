# Provider LLM — stato corrente

Multi-provider attivo (it. 01 esteso) con **reasoning/thinking al massimo per ogni provider**. Selezione via `INTERFERENCE_PROVIDER` in `.env` (gitignored). **Default progetto: `deepseek` / `deepseek-v4-pro` con ragionamento MAX.** Default model fallback per provider in `src/config.ts` (`PROVIDERS`), override con `INTERFERENCE_MODEL`.

| `INTERFERENCE_PROVIDER` | env key | default model | via | reasoning (max) | live |
|---|---|---|---|---|---|
| `deepseek` (default) | `DEEPSEEK_API_KEY` | deepseek-v4-pro | `@ai-sdk/deepseek` | `providerOptions.deepseek: {thinking:{type:enabled}, reasoningEffort:max}` | ✅ |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 | `@ai-sdk/anthropic` | `providerOptions.anthropic: {thinking:{type:enabled,budgetTokens:32000}}` + maxOutputTokens 64000 | ✅ |
| `glm` | `GLM_API_KEY` | glm-4.6 | `@ai-sdk/openai-compatible` (`…/api/paas/v4`) | `transformRequestBody` inietta `thinking:{type:enabled}` | ✅ |
| `kimi` | `KIMI_API_KEY` | kimi-k2.6 | `@ai-sdk/openai-compatible` (`…/v1`) | `thinking:{type:enabled,keep:all}` | ⚠️ vedi sotto |

Context limit per provider (usato da compaction, it.10):
| Provider | contextLimit |
|---|---|
| deepseek | 1_000_000 |
| anthropic | 200_000 |
| glm | 200_000 |
| kimi | 128_000 |

Reasoning reso nel `fullStream` come `part.type==='reasoning-delta'` → CLI lo stampa dim sotto `┄ thinking`. Fallback `extractReasoningMiddleware({tagName:'think'})` sui provider openai-compatible per modelli che inlineano `<think>`. Round-trip: `runTurn` accoda `result.response.messages` (necessario a DeepSeek thinking).

## Gotcha / stati

- **Kimi**: il codice è corretto, ma l'account/API key fornita è **sospesa per credito insufficiente** → ogni chiamata fallisce con errore di billing (non un bug). Per testarlo davvero serve ricaricare l'account Moonshot. `kimi-k2.6` non confermato live per questo motivo.
- **OpenAI**: non usato dal progetto e senza credito → in `.env` la riga `OPENAI_API_KEY` è commentata.
- **DeepSeek**: `deepseek-chat` deprecato dal 2026-07-24 → migrare il default a `deepseek-v4-flash`.
- **GLM**: baseURL con path `/api/paas/v4` (NON `/v1`). Se in futuro si usa il GLM Coding Plan serve `/api/coding/paas/v4`.
- Default = solo **fallback** (deciso 2026-06-28): l'utente sceglie via `INTERFERENCE_MODEL` (e più avanti via `/model` + picker TUI, it. 06).
- Il provider **locale** OpenAI-compatible (MLX/LM Studio/Ollama) è l'it. 07: riusa la stessa astrazione `openai-compatible`.

_aggiornato: 2026-06-28_
