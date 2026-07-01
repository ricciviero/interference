import { currentModel, currentProviderId, type ProviderId } from "./config.ts";
import { getModelInfo } from "./catalog.ts";

interface Pricing {
  inputPer1M: number;
  outputPer1M: number;
}

// Safety net (it. 37): used only if the models.dev catalog lacks the id (offline
// on first launch AND the id is also missing from the snapshot, or a brand-new model
// not yet in the catalog). The primary source is the catalog — see getPricing().
const PRICING: Record<string, Pricing> = {
  // Sonnet 5: standard $3/$15 (intro $2/$10 until 2026-08-31).
  "claude-sonnet-5": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "deepseek-v4-pro": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "deepseek-v4-flash": { inputPer1M: 0.27, outputPer1M: 1.10 },
  "gpt-5.5": { inputPer1M: 5.0, outputPer1M: 30.0 },
  "gpt-5.4": { inputPer1M: 2.50, outputPer1M: 15.0 },
  "claude-opus-4-8": { inputPer1M: 5.0, outputPer1M: 25.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5": { inputPer1M: 1.0, outputPer1M: 5.0 },
  "glm-5.2": { inputPer1M: 1.0, outputPer1M: 1.0 },
  "kimi-k2.7": { inputPer1M: 0.5, outputPer1M: 2.0 },
  "kimi-k2.5": { inputPer1M: 0.5, outputPer1M: 2.0 },
};

export function getPricing(modelId?: string, providerId?: ProviderId): Pricing {
  const id = modelId ?? currentModel();
  const pid = providerId ?? currentProviderId();
  const fromCatalog = getModelInfo(pid, id);
  if (fromCatalog?.cost) {
    return { inputPer1M: fromCatalog.cost.input, outputPer1M: fromCatalog.cost.output };
  }
  return PRICING[id] ?? { inputPer1M: 2.0, outputPer1M: 8.0 };
}

// Prompt caching (it. 35): tokens read from cache cost ~10% of full input price;
// those written to cache (Anthropic only, opt-in) cost ~125%. Standard Anthropic
// coefficients; DeepSeek/OpenAI-compatible don't expose a separate write cost
// (cacheWriteTokens stays 0 for them → no effect on cost).
const CACHE_READ_DISCOUNT = 0.1;
const CACHE_WRITE_PREMIUM = 1.25;

let totalNoCacheInputTokens = 0;
let totalOutputTokens = 0;
let totalCacheReadTokens = 0;
let totalCacheWriteTokens = 0;

/** `inputTokens` here is the NON-cached portion (the rest comes from cacheRead/cacheWriteTokens) —
 *  see `agent/loop.ts`, which extracts them from `usage.inputTokenDetails`. */
export function trackUsage(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
) {
  totalNoCacheInputTokens += inputTokens;
  totalOutputTokens += outputTokens;
  totalCacheReadTokens += cacheReadTokens;
  totalCacheWriteTokens += cacheWriteTokens;
}

export function getTotalCost(): number {
  const pricing = getPricing(currentModel());
  return (
    (totalNoCacheInputTokens / 1_000_000) * pricing.inputPer1M +
    (totalCacheReadTokens / 1_000_000) * pricing.inputPer1M * CACHE_READ_DISCOUNT +
    (totalCacheWriteTokens / 1_000_000) * pricing.inputPer1M * CACHE_WRITE_PREMIUM +
    (totalOutputTokens / 1_000_000) * pricing.outputPer1M
  );
}

export function estimateCost(inputTokens: number): number {
  const pricing = getPricing(currentModel());
  return (inputTokens / 1_000_000) * pricing.inputPer1M;
}

export function formatCost(cost: number): string {
  if (cost < 0.0001) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

export function getUsageStats() {
  return {
    inputTokens: totalNoCacheInputTokens + totalCacheReadTokens + totalCacheWriteTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    cacheWriteTokens: totalCacheWriteTokens,
  };
}
