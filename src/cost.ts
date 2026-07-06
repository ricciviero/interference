import { currentModel, currentProviderId, type ProviderId } from "./config.ts";
import { getModelInfo } from "./catalog.ts";
import { getOpenRouterModelInfo } from "./openrouter.ts";

interface Pricing {
  inputPer1M: number;
  outputPer1M: number;
  /** Absolute price per 1M cache-read tokens, from the catalog (models.dev).
   *  When absent, getTotalCost() falls back to inputPer1M * 0.1 (Anthropic-style). */
  cacheReadPer1M?: number;
  /** Absolute price per 1M cache-write tokens, from the catalog (models.dev).
   *  When absent, getTotalCost() falls back to inputPer1M * 1.25 (Anthropic-style). */
  cacheWritePer1M?: number;
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
  // OpenRouter is an aggregator not carried in models.dev's snapshot: take per-model pricing
  // from its own /models catalog (loaded via openrouter.ts) when the model is known.
  if (pid === "openrouter") {
    const or = getOpenRouterModelInfo(id);
    if (or && (or.inputPer1M > 0 || or.outputPer1M > 0)) {
      return { inputPer1M: or.inputPer1M, outputPer1M: or.outputPer1M };
    }
  }
  const fromCatalog = getModelInfo(pid, id);
  if (fromCatalog?.cost) {
    return {
      inputPer1M: fromCatalog.cost.input,
      outputPer1M: fromCatalog.cost.output,
      cacheReadPer1M: fromCatalog.cost.cacheRead,
      cacheWritePer1M: fromCatalog.cost.cacheWrite,
    };
  }
  return PRICING[id] ?? { inputPer1M: 2.0, outputPer1M: 8.0 };
}

// Prompt caching (it. 35): when the catalog provides absolute per-1M prices for
// cache reads/writes (cacheReadPer1M / cacheWritePer1M), those are used directly.
// Otherwise, fall back to Anthropic-style coefficients (10% read, 125% write) —
// this handles models where only input/output prices are known (e.g. fallback
// PRICING map, or a catalog entry with no cache_read/cache_write).
const DEFAULT_CACHE_READ_DISCOUNT = 0.1;
const DEFAULT_CACHE_WRITE_PREMIUM = 1.25;

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
  const cacheReadPrice =
    pricing.cacheReadPer1M ?? pricing.inputPer1M * DEFAULT_CACHE_READ_DISCOUNT;
  const cacheWritePrice =
    pricing.cacheWritePer1M ?? pricing.inputPer1M * DEFAULT_CACHE_WRITE_PREMIUM;
  return (
    (totalNoCacheInputTokens / 1_000_000) * pricing.inputPer1M +
    (totalCacheReadTokens / 1_000_000) * cacheReadPrice +
    (totalCacheWriteTokens / 1_000_000) * cacheWritePrice +
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

// --- Session persistence of cost (fix/11) ----------------------------------
// The counters above live in process memory, so on --continue the cost restarted
// from zero (footer showed a big #turnCount but ~$0). Persist the RAW buckets in the
// session (distinct no-cache/read/write are needed to re-price correctly) and re-seed
// them on load so the session cost survives a reload.

export interface RawUsage {
  noCacheInput: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function getRawUsage(): RawUsage {
  return {
    noCacheInput: totalNoCacheInputTokens,
    output: totalOutputTokens,
    cacheRead: totalCacheReadTokens,
    cacheWrite: totalCacheWriteTokens,
  };
}

/** Re-seed the cumulative counters from a persisted session (no-op if absent). */
export function restoreUsage(u: RawUsage | undefined | null): void {
  if (!u) return;
  totalNoCacheInputTokens = u.noCacheInput ?? 0;
  totalOutputTokens = u.output ?? 0;
  totalCacheReadTokens = u.cacheRead ?? 0;
  totalCacheWriteTokens = u.cacheWrite ?? 0;
}

/** Zero the counters (e.g. /clear starts a fresh conversation → fresh cost). */
export function resetUsage(): void {
  totalNoCacheInputTokens = 0;
  totalOutputTokens = 0;
  totalCacheReadTokens = 0;
  totalCacheWriteTokens = 0;
}
