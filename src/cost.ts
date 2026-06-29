import { currentProvider } from "./config.ts";

interface Pricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, Pricing> = {
  "deepseek-v4-pro": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "deepseek-v4-flash": { inputPer1M: 0.50, outputPer1M: 2.0 },
  "gpt-5.5": { inputPer1M: 5.0, outputPer1M: 30.0 },
  "gpt-5.4": { inputPer1M: 2.50, outputPer1M: 15.0 },
  "claude-opus-4-8": { inputPer1M: 5.0, outputPer1M: 25.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "glm-5.2": { inputPer1M: 2.0, outputPer1M: 2.0 },
  "kimi-k2.7": { inputPer1M: 1.0, outputPer1M: 4.0 },
};

export function getPricing(modelId: string): Pricing {
  return PRICING[modelId] ?? { inputPer1M: 2.0, outputPer1M: 8.0 };
}

let totalInputTokens = 0;
let totalOutputTokens = 0;

export function trackUsage(inputTokens: number, outputTokens: number) {
  totalInputTokens += inputTokens;
  totalOutputTokens += outputTokens;
}

export function getTotalCost(): number {
  const def = currentProvider();
  const pricing = getPricing(def.defaultModel);
  return (
    (totalInputTokens / 1_000_000) * pricing.inputPer1M +
    (totalOutputTokens / 1_000_000) * pricing.outputPer1M
  );
}

export function estimateCost(inputTokens: number): number {
  const pricing = getPricing(currentProvider().defaultModel);
  return (inputTokens / 1_000_000) * pricing.inputPer1M;
}

export function formatCost(cost: number): string {
  if (cost < 0.0001) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

export function getUsageStats() {
  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
