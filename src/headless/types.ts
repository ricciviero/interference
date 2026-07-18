import type { BehaviorSessionSnapshot } from "../behavior/types.ts";
import type { ProviderId, ThinkingLevel } from "../config.ts";
import type { RawUsage } from "../cost.ts";

export const HEADLESS_TRAJECTORY_VERSION = 1 as const;

export type HeadlessTreatment = "legacy" | "authoritative";
export type HeadlessOutcome =
  | "completed"
  | "failed"
  | "aborted"
  | "refused"
  | "budget-exceeded";

export interface HeadlessOptions {
  promptFile?: string;
  outputJson: string;
  treatment: HeadlessTreatment;
  provider: ProviderId;
  model: string;
  thinking: ThinkingLevel;
  maxCostUsd: number;
  maxOutputTokens: number;
  timeoutMs: number;
  runId?: string;
  taskId?: string;
}

export interface HeadlessToolEvent {
  sequence: number;
  type: "tool-call" | "tool-result";
  toolCallId: string;
  toolName: string;
  subject?: string;
  kind?: "read" | "mutation" | "validation" | "interaction" | "other";
  outcome?: "succeeded" | "failed" | "denied" | "refused";
  exitCode?: number;
}

export interface HeadlessTrajectory {
  schemaVersion: typeof HEADLESS_TRAJECTORY_VERSION;
  interferenceVersion: string;
  runId: string;
  taskId?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  workspace: string;
  treatment: HeadlessTreatment;
  provider: ProviderId;
  model: string;
  thinking: ThinkingLevel;
  outcome: HeadlessOutcome;
  exitCode: number;
  finalAnswer: string;
  tools: HeadlessToolEvent[];
  skills: {
    matched: string[];
    agenticSelected: string[];
  };
  usage: RawUsage & {
    input: number;
    costUsd: number;
    classifierInputTokens: number;
    classifierOutputTokens: number;
    classifierCostUsd: number;
  };
  budget: {
    maxCostUsd: number;
    exceeded: boolean;
  };
  behavior?: BehaviorSessionSnapshot;
  error?: { name: string; message: string };
}
