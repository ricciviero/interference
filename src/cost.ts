import { currentProvider } from "./config.ts";
import { estimateMessagesTokens } from "./agent/compaction.ts";
import type { ModelMessage } from "ai";

interface Pricing {
  inputPer1M: number;
  outputPer1M: number;
}

const DEFAULT_PRICING: Record<string, Pricing> = {
  "deepseek-v4-pro": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "glm-4.6": { inputPer1M: 2.0, outputPer1M: 2.0 },
  "kimi-k2.6": { inputPer1M: 1.0, outputPer1M: 4.0 },
};

export function getPricing(modelId: string): Pricing {
  return DEFAULT_PRICING[modelId] ?? { inputPer1M: 2.0, outputPer1M: 8.0 };
}

let totalInputTokens = 0;
let totalOutputTokens = 0;

export function trackUsage(inputTokens: number, outputTokens: number) {
  totalInputTokens += inputTokens;
  totalOutputTokens += outputTokens;
}

export function getTotalCost(modelId?: string): number {
  const pricing = getPricing(modelId ?? currentProvider().defaultModel);
  return (
    (totalInputTokens / 1_000_000) * pricing.inputPer1M +
    (totalOutputTokens / 1_000_000) * pricing.outputPer1M
  );
}

export function getUsageStats(modelId?: string) {
  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cost: getTotalCost(modelId),
  };
}

export function estimateCost(messages: ModelMessage[], modelId?: string): number {
  const inputTokens = estimateMessagesTokens(messages);
  const pricing = getPricing(modelId ?? currentProvider().defaultModel);
  return (inputTokens / 1_000_000) * pricing.inputPer1M;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
