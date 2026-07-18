import type {
  BehaviorPlan,
  BehaviorState,
  Capability,
  GateStatus,
  ProjectConfig,
  HostExecutionEvent,
  Evidence,
} from "@agenticswe/core";
import type { AgentMode, ProviderId } from "../config.ts";

/** Kept aligned with the exact dependency selected for this integration. */
export const AGENTIC_SWE_PACKAGE_VERSION = "0.1.0" as const;

export interface BehaviorTurnContext {
  sessionId: string;
  turnNumber: number;
  savedTurnNumber?: number;
  savedRequestId?: string;
  selectedSkillNames?: readonly string[];
  planningRecord?: string;
  state?: BehaviorState;
  onPlan?: (snapshot: BehaviorSessionSnapshot) => void | Promise<void>;
  events?: readonly HostExecutionEvent[];
  savedProtocolVersion?: string;
  savedPackageVersion?: string;
}

export interface BehaviorSessionSnapshot {
  schemaVersion: 1;
  protocolVersion: string;
  packageVersion: typeof AGENTIC_SWE_PACKAGE_VERSION;
  requestId: string;
  phase: BehaviorPlan["phase"];
  turnNumber: number;
  planningRecord?: string;
  state?: BehaviorState;
  events?: HostExecutionEvent[];
  evidence?: Evidence[];
  outstandingCriteria?: string[];
  plan?: BehaviorPlan;
  /** Union of Agentic SWE skills selected in any phase of the current turn. */
  observedSkills?: string[];
  effectiveCapabilities?: Capability[];
  /** Bounded classifier telemetry; contains no prompt or model output. */
  classifier?: ClassifierTelemetry;
}

export interface LegacyBehaviorObservation {
  mode: AgentMode;
  toolNames: string[];
  selectedSkills: string[];
  capabilities: Capability[];
}

export interface ClassifierTelemetry {
  requestId: string;
  provider: ProviderId;
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  summaryCharacters: number;
  truncated: boolean;
  attempts: number;
  outcome: "success" | "error" | "aborted";
}

export type DivergenceCategory = "gate" | "skill" | "capability";

export interface ShadowDivergence {
  category: DivergenceCategory;
  key: string;
  legacy: string;
  agentic: string;
}

export interface ShadowComparison {
  matches: boolean;
  divergences: ShadowDivergence[];
}

export interface ShadowPlanProjection {
  phase: BehaviorPlan["phase"];
  effectiveClassification: BehaviorPlan["effectiveClassification"];
  gates: Array<{ id: string; status: GateStatus; reasonCode: string }>;
  selectedSkills: string[];
  requestedCapabilities: Capability[];
  effectiveCapabilities: Capability[];
  reasons: string[];
}

export interface ShadowDiagnosticProjection {
  code: string;
  severity: "info" | "warning" | "error";
}

export interface ShadowRecord {
  schemaVersion: 1;
  recordedAt: string;
  sessionId: string;
  turnNumber: number;
  requestId: string;
  workspaceHash: string;
  requestHash: string;
  requestCharacters: number;
  protocolVersion: string;
  packageVersion: typeof AGENTIC_SWE_PACKAGE_VERSION;
  status: "evaluated" | "failed";
  legacy: LegacyBehaviorObservation;
  plan?: ShadowPlanProjection;
  comparison?: ShadowComparison;
  classifier?: ClassifierTelemetry;
  diagnostics: ShadowDiagnosticProjection[];
}

export interface ShadowEvaluation {
  plan: BehaviorPlan;
  classification: import("@agenticswe/core").ClassificationDecision;
  requestSignals: {
    explicitOnboarding: boolean;
    explicitLighterProcess: boolean;
    lighterProcessReason?: string;
    mutationRequested: boolean;
  };
  relevantSkills: string[];
  effectiveCapabilities: Capability[];
  projectConfig: ProjectConfig | null;
  comparison: ShadowComparison;
  diagnostics: ShadowDiagnosticProjection[];
  classifier?: ClassifierTelemetry;
}

export interface ShadowReport {
  records: number;
  evaluated: number;
  failed: number;
  divergent: number;
  classifierCostUsd: number;
  classifierInputTokens: number;
  classifierOutputTokens: number;
  last?: ShadowRecord;
}
