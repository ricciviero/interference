import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { trackUsage, getTotalCost, getUsageStats, formatCost, getRawUsage, restoreUsage, resetUsage } from "../cost.ts";
import { setProvider, setModel, resetModel } from "../config.ts";
import { _resetCatalogForTests } from "../catalog.ts";

// cost.ts holds cumulative module-level state — there is no explicit reset, so every
// test works by DELTA (value after - value before) instead of on the absolute total.
function costDelta(fn: () => void): number {
  const before = getTotalCost();
  fn();
  return getTotalCost() - before;
}

function forModel(provider: string, model: string, fn: () => void): void {
  setProvider(provider as Parameters<typeof setProvider>[0]);
  setModel(model);
  fn();
}

describe("trackUsage / getTotalCost cache-aware (iter 35)", () => {
  beforeEach(() => {
    setProvider("anthropic");
    setModel("claude-opus-4-8"); // known pricing: $5/$25 per 1M
  });

  afterAll(() => {
    resetModel();
    setProvider("deepseek");
  });

  test("no cache (unchanged behavior): cost = full input + full output", () => {
    const delta = costDelta(() => trackUsage(1_000_000, 1_000_000));
    // 1M input @ $5 + 1M output @ $25 = $30
    expect(delta).toBeCloseTo(30, 5);
  });

  test("cache read costs 10% of full input price (Anthropic: catalog cache_read=0.5, which equals 5*0.1)", () => {
    const delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    // 1M cacheRead @ $5 * 0.1 = $0.5 (= catalog cache_read: 0.5)
    expect(delta).toBeCloseTo(0.5, 5);
  });

  test("cache write costs 125% of full input price (Anthropic: catalog cache_write=6.25, which equals 5*1.25)", () => {
    const delta = costDelta(() => trackUsage(0, 0, 0, 1_000_000));
    // 1M cacheWrite @ $5 * 1.25 = $6.25 (= catalog cache_write: 6.25)
    expect(delta).toBeCloseTo(6.25, 5);
  });

  test("mixed turn (noCache + cacheRead + output) sums correctly", () => {
    const delta = costDelta(() => trackUsage(100_000, 50_000, 900_000, 0));
    // 100k noCache @ $5/1M + 900k cacheRead @ $5/1M*0.1 + 50k output @ $25/1M
    const expected = (100_000 / 1_000_000) * 5 + (900_000 / 1_000_000) * 5 * 0.1 + (50_000 / 1_000_000) * 25;
    expect(delta).toBeCloseTo(expected, 5);
  });

  test("getUsageStats().inputTokens include noCache + cacheRead + cacheWrite", () => {
    const before = getUsageStats();
    trackUsage(100, 10, 200, 50);
    const after = getUsageStats();
    expect(after.inputTokens - before.inputTokens).toBe(100 + 200 + 50);
    expect(after.cacheReadTokens - before.cacheReadTokens).toBe(200);
    expect(after.cacheWriteTokens - before.cacheWriteTokens).toBe(50);
  });

  test("formatCost formats as dollars", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0.00001)).toBe("<$0.01");
  });
});

describe("cache pricing from catalog (absolute prices, not coefficients)", () => {
  afterAll(() => {
    resetModel();
    setProvider("deepseek");
  });

  // Ensure we use the snapshot catalog (not a stale in-memory one).
  afterEach(() => {
    _resetCatalogForTests();
  });

  // --- DeepSeek ---
  test("deepseek-v4-pro: cache_read from catalog (0.003625/1M), NOT 10% of input (0.0435/1M)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("deepseek", "deepseek-v4-pro", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    // Catalog cache_read = 0.003625, not input*0.1 = 0.435*0.1 = 0.0435
    expect(delta).toBeCloseTo(0.003625, 5);
    expect(delta).not.toBeCloseTo(0.0435, 5);
  });

  test("deepseek-v4-flash: cache_read from catalog (0.0028/1M), NOT 10% of input (0.014/1M)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("deepseek", "deepseek-v4-flash", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    // Catalog cache_read = 0.0028, not input*0.1 = 0.14*0.1 = 0.014
    expect(delta).toBeCloseTo(0.0028, 5);
    expect(delta).not.toBeCloseTo(0.014, 5);
  });

  // --- ZhipuAI / GLM ---
  test("glm-5.2: cache_read from catalog (0.26/1M), NOT 10% of input (0.14/1M)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("glm", "glm-5.2", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    // Catalog cache_read = 0.26, not input*0.1 = 1.4*0.1 = 0.14
    expect(delta).toBeCloseTo(0.26, 5);
    expect(delta).not.toBeCloseTo(0.14, 5);
  });

  test("glm-5.2: cache_write is 0 (free) from catalog, NOT 125% of input", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("glm", "glm-5.2", () => {
      delta = costDelta(() => trackUsage(0, 0, 0, 1_000_000));
    });
    // Catalog cache_write = 0 (free), not input*1.25 = 1.4*1.25 = 1.75
    expect(delta).toBeCloseTo(0, 5);
    expect(delta).not.toBeCloseTo(1.75, 5);
  });

  // --- MoonshotAI / Kimi ---
  test("kimi-k2.7-code: cache_read from catalog (0.19/1M), NOT 10% of input (0.095/1M)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("kimi", "kimi-k2.7-code", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    // Catalog cache_read = 0.19, not input*0.1 = 0.95*0.1 = 0.095
    expect(delta).toBeCloseTo(0.19, 5);
    expect(delta).not.toBeCloseTo(0.095, 5);
  });

  test("kimi-k2.5: cache_read from catalog (0.1/1M), NOT 10% of input (0.06/1M)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("kimi", "kimi-k2.5", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    // Catalog cache_read = 0.1, not input*0.1 = 0.6*0.1 = 0.06
    expect(delta).toBeCloseTo(0.1, 5);
    expect(delta).not.toBeCloseTo(0.06, 5);
  });

  // --- OpenAI (regression: catalog prices match coefficients by coincidence) ---
  test("gpt-5.5: cache_read still correct (catalog 0.5 = input 5 * 0.1)", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("openai", "gpt-5.5", () => {
      delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    });
    expect(delta).toBeCloseTo(0.5, 5);
  });

  test("gpt-5.6-luna: uses the offline catalog's $1/$6 pricing", () => {
    _resetCatalogForTests();
    let delta = 0;
    forModel("openai", "gpt-5.6-luna", () => {
      delta = costDelta(() => trackUsage(1_000_000, 1_000_000));
    });
    expect(delta).toBeCloseTo(7, 5);
  });
});

describe("usage persistence across reload (fix/11)", () => {
  test("getRawUsage/restoreUsage round-trip: cost survives a simulated reload", () => {
    resetUsage();
    trackUsage(1000, 200, 500, 100);
    const snapshot = getRawUsage();
    const costBefore = getTotalCost();
    // simulate process restart: in-memory counters wiped
    resetUsage();
    expect(getTotalCost()).toBe(0);
    // simulate --continue: re-seed from the persisted session
    restoreUsage(snapshot);
    expect(getRawUsage()).toEqual(snapshot);
    expect(getTotalCost()).toBeCloseTo(costBefore, 10);
  });

  test("restoreUsage(undefined) is a no-op (new session, nothing to restore)", () => {
    resetUsage();
    trackUsage(50, 10, 0, 0);
    const before = getRawUsage();
    restoreUsage(undefined);
    expect(getRawUsage()).toEqual(before);
  });

  test("resetUsage zeroes the counters (/clear -> fresh cost)", () => {
    trackUsage(999, 999, 999, 999);
    resetUsage();
    expect(getRawUsage()).toEqual({ noCacheInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(getTotalCost()).toBe(0);
  });
});
