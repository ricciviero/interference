import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { trackUsage, getTotalCost, getUsageStats, formatCost } from "../cost.ts";
import { setProvider, setModel, resetModel } from "../config.ts";

// cost.ts holds cumulative module-level state — there is no explicit reset, so every
// test works by DELTA (value after - value before) instead of on the absolute total.
function costDelta(fn: () => void): number {
  const before = getTotalCost();
  fn();
  return getTotalCost() - before;
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

  test("cache read costs 10% of full input price", () => {
    const delta = costDelta(() => trackUsage(0, 0, 1_000_000, 0));
    // 1M cacheRead @ $5 * 0.1 = $0.5
    expect(delta).toBeCloseTo(0.5, 5);
  });

  test("cache write costs 125% of full input price", () => {
    const delta = costDelta(() => trackUsage(0, 0, 0, 1_000_000));
    // 1M cacheWrite @ $5 * 1.25 = $6.25
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
