import { AsyncLocalStorage } from "node:async_hooks";
import type { BehaviorPlan, Capability, ProjectConfig } from "@agenticswe/core";
import type { BehaviorEventRecorder } from "./events.ts";

export interface BehaviorExecutionContext {
  sessionId: string;
  turnNumber: number;
  requestId: string;
  plan: BehaviorPlan;
  effectiveCapabilities: readonly Capability[];
  projectConfig: ProjectConfig | null;
  recorder?: BehaviorEventRecorder;
}

const behaviorStorage = new AsyncLocalStorage<BehaviorExecutionContext>();

export function currentBehaviorExecution(): BehaviorExecutionContext | undefined {
  return behaviorStorage.getStore();
}

export function runWithBehaviorExecution<T>(
  context: BehaviorExecutionContext,
  callback: () => T,
): T {
  return behaviorStorage.run(context, callback);
}
