import type {
  ClassificationDecision,
  Evidence,
  SkillRouter,
  TaskClassifier,
} from "@agenticswe/core";
import {
  PROTOCOL_VERSION,
  runTaskClassifier,
  type BehaviorPlan,
  type Capability,
} from "@agenticswe/core";
import { createNodeRuntime } from "@agenticswe/node";
import { currentBehaviorConfig } from "../config-file.ts";
import { ModelBehaviorClassifier } from "./classifier.ts";
import {
  appendShadowRecord,
  behaviorWorkspaceHash,
  hashBehaviorValue,
} from "./diagnostics.ts";
import {
  behaviorGlobalSkillDirectories,
  behaviorSkillCandidates,
  type BehaviorSkillCandidate,
} from "./skills.ts";
import {
  AGENTIC_SWE_PACKAGE_VERSION,
  type ClassifierTelemetry,
  type LegacyBehaviorObservation,
  type ShadowComparison,
  type ShadowDiagnosticProjection,
  type ShadowEvaluation,
  type ShadowRecord,
} from "./types.ts";

const PORT_TIMEOUT_MS = 45_000;

export function behaviorRequestId(
  sessionId: string,
  turnNumber: number,
  summary: string,
): string {
  return `${sessionId}:${turnNumber}:${hashBehaviorValue(summary).slice(0, 12)}`;
}

export interface BehaviorPort extends TaskClassifier, SkillRouter {
  takeTelemetry?(requestId: string): ClassifierTelemetry | undefined;
  takeRequestSignals?(requestId: string): {
    explicitOnboarding: boolean;
    explicitLighterProcess: boolean;
    lighterProcessReason?: string;
    mutationRequested: boolean;
  } | undefined;
}

export interface ShadowTurnInput {
  sessionId: string;
  turnNumber: number;
  summary: string;
  legacy: LegacyBehaviorObservation;
  planningRecord?: string;
  state?: import("@agenticswe/core").BehaviorState;
  classification?: ClassificationDecision;
  requestSignals?: {
    explicitOnboarding: boolean;
    explicitLighterProcess: boolean;
    lighterProcessReason?: string;
    mutationRequested: boolean;
  };
  relevantSkills?: readonly string[];
  implementationFinished?: boolean;
  evidence?: readonly Evidence[];
}

export interface ShadowRuntimeDependencies {
  classifierFactory?: (skills: readonly BehaviorSkillCandidate[]) => BehaviorPort;
  appendRecord?: (record: ShadowRecord, workspace?: string) => Promise<void>;
  workspace?: string;
  portTimeoutMs?: number;
  now?: () => Date;
  skillCandidates?: readonly BehaviorSkillCandidate[];
  globalSkillDirectories?: readonly string[];
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function comparePlan(
  plan: BehaviorPlan,
  legacy: LegacyBehaviorObservation,
  effectiveCapabilities: readonly Capability[],
): ShadowComparison {
  const divergences: ShadowComparison["divergences"] = [];
  const legacySkills = new Set(legacy.selectedSkills);
  const agenticSkills = new Set(plan.selectedSkills.map((skill) => skill.name));
  for (const name of sortedUnique([...legacySkills, ...agenticSkills])) {
    if (legacySkills.has(name) !== agenticSkills.has(name)) {
      divergences.push({
        category: "skill",
        key: name,
        legacy: legacySkills.has(name) ? "selected" : "not-selected",
        agentic: agenticSkills.has(name) ? "selected" : "not-selected",
      });
    }
  }

  const legacyCapabilities = new Set(legacy.capabilities);
  const agenticCapabilities = new Set(effectiveCapabilities);
  for (const capability of sortedUnique([
    ...legacyCapabilities,
    ...agenticCapabilities,
  ] as Capability[])) {
    if (legacyCapabilities.has(capability) !== agenticCapabilities.has(capability)) {
      divergences.push({
        category: "capability",
        key: capability,
        legacy: legacyCapabilities.has(capability) ? "available" : "unavailable",
        agentic: agenticCapabilities.has(capability) ? "requested" : "not-requested",
      });
    }
  }

  for (const gate of plan.requiredGates) {
    if (gate.status === "required" || gate.status === "blocked") {
      divergences.push({
        category: "gate",
        key: gate.id,
        legacy: "not-structurally-enforced",
        agentic: gate.status,
      });
    }
  }

  return { matches: divergences.length === 0, divergences };
}

function projectDiagnostics(
  diagnostics: readonly { code: string; severity: "info" | "warning" | "error" }[],
): ShadowDiagnosticProjection[] {
  return diagnostics.map(({ code, severity }) => ({ code, severity }));
}

function projectPlan(
  plan: BehaviorPlan,
  effectiveCapabilities: readonly Capability[],
): NonNullable<ShadowRecord["plan"]> {
  return {
    phase: plan.phase,
    effectiveClassification: plan.effectiveClassification,
    gates: plan.requiredGates.map((gate) => ({
      id: gate.id,
      status: gate.status,
      reasonCode: gate.reasonCode,
    })),
    selectedSkills: plan.selectedSkills.map((skill) => skill.name),
    requestedCapabilities: [...plan.requestedCapabilities],
    effectiveCapabilities: [...effectiveCapabilities],
    reasons: [...plan.reasons],
  };
}

export function capabilitiesForLegacyTools(toolNames: readonly string[]): Capability[] {
  const capabilities = new Set<Capability>([
    "repository:read",
    "instructions:read",
    "skills:read",
  ]);
  for (const toolName of toolNames) {
    if (toolName === "write" || toolName === "edit") capabilities.add("workspace:mutate");
    else if (toolName === "bash") capabilities.add("commands:execute");
    else if (toolName === "task") capabilities.add("subagents:invoke");
  }
  return sortedUnique([...capabilities]);
}

/** Concrete capabilities implemented by the current Interference toolset. */
export function hostCapabilitiesForTools(toolNames: readonly string[]): Capability[] {
  const capabilities = new Set(capabilitiesForLegacyTools(toolNames));
  if (toolNames.includes("write") || toolNames.includes("edit")) {
    capabilities.add("workspace:setup-write");
    capabilities.add("workspace:plan-write");
  }
  return sortedUnique([...capabilities]);
}

export function userModeCapabilities(
  mode: LegacyBehaviorObservation["mode"],
  toolNames: readonly string[],
  mutationRequested = true,
): Capability[] {
  if (mode === "build" && mutationRequested) return hostCapabilitiesForTools(toolNames);
  return sortedUnique([
    "repository:read",
    "instructions:read",
    "skills:read",
  ] satisfies Capability[]);
}

export function createShadowRuntime(dependencies: ShadowRuntimeDependencies = {}) {
  const workspace = dependencies.workspace ?? process.cwd();
  const classifierFactory =
    dependencies.classifierFactory ??
    ((skills: readonly BehaviorSkillCandidate[]) => new ModelBehaviorClassifier(skills));
  const appendRecord = dependencies.appendRecord ?? appendShadowRecord;
  const now = dependencies.now ?? (() => new Date());

  return {
    async evaluateTurn(
      input: ShadowTurnInput,
      signal?: AbortSignal,
    ): Promise<ShadowEvaluation | null> {
      const requestHash = hashBehaviorValue(input.summary);
      const requestId = behaviorRequestId(input.sessionId, input.turnNumber, input.summary);
      const classifier = classifierFactory(
        dependencies.skillCandidates ?? behaviorSkillCandidates(),
      );
      const suppliedClassification = input.classification !== undefined;
      const classification = suppliedClassification
        ? { classification: input.classification!, diagnostics: [] }
        : await runTaskClassifier(
            classifier,
            { requestId, summary: input.summary },
            signal,
            dependencies.portTimeoutMs ?? PORT_TIMEOUT_MS,
          );
      const requestSignals =
        input.requestSignals ?? classifier.takeRequestSignals?.(requestId);
      const runtime = createNodeRuntime({
        startPath: workspace,
        globalSkillDirectories: [
          ...(dependencies.globalSkillDirectories ?? behaviorGlobalSkillDirectories()),
        ],
        ...(suppliedClassification ? {} : { skillRouter: classifier }),
        portTimeoutMs: dependencies.portTimeoutMs ?? PORT_TIMEOUT_MS,
      });

      try {
        const result = await runtime.evaluate(
          {
            requestId,
            summary: input.summary,
            classification: classification.classification,
            explicitOnboarding: requestSignals?.explicitOnboarding ?? false,
            explicitLighterProcess: requestSignals?.explicitLighterProcess ?? false,
            mutationRequested: requestSignals?.mutationRequested ?? true,
            ...(requestSignals?.lighterProcessReason
              ? { lighterProcessReason: requestSignals.lighterProcessReason }
              : {}),
            hostCapabilities: hostCapabilitiesForTools(input.legacy.toolNames),
            userModeCapabilities: userModeCapabilities(
              input.legacy.mode,
              input.legacy.toolNames,
              requestSignals?.mutationRequested ?? true,
            ),
            ...(input.planningRecord ? { planningRecord: input.planningRecord } : {}),
            ...(input.legacy.selectedSkills.length > 0
              ? { relevantSkills: [...(input.relevantSkills ?? input.legacy.selectedSkills)] }
              : input.relevantSkills && input.relevantSkills.length > 0
                ? { relevantSkills: [...input.relevantSkills] }
              : {}),
            ...(input.state ? { state: input.state } : {}),
            ...(input.implementationFinished !== undefined
              ? { implementationFinished: input.implementationFinished }
              : {}),
            ...(input.evidence ? { evidence: [...input.evidence] } : {}),
          },
          signal,
        );
        const comparison = comparePlan(
          result.plan,
          input.legacy,
          result.effectiveCapabilities,
        );
        const classifierTelemetry = suppliedClassification
          ? undefined
          : classifier.takeTelemetry?.(requestId);
        const diagnostics = projectDiagnostics([
          ...result.diagnostics,
          ...classification.diagnostics,
        ]);
        const evaluation: ShadowEvaluation = {
          plan: result.plan,
          classification: classification.classification,
          requestSignals: {
            explicitOnboarding: requestSignals?.explicitOnboarding ?? false,
            explicitLighterProcess: requestSignals?.explicitLighterProcess ?? false,
            mutationRequested: requestSignals?.mutationRequested ?? true,
            ...(requestSignals?.lighterProcessReason
              ? { lighterProcessReason: requestSignals.lighterProcessReason }
              : {}),
          },
          relevantSkills: result.inspection.availableSkills
            .filter((skill) => skill.relevant)
            .map((skill) => skill.name),
          effectiveCapabilities: [...result.effectiveCapabilities],
          projectConfig: result.inspection.config.config,
          comparison,
          diagnostics,
          ...(classifierTelemetry ? { classifier: classifierTelemetry } : {}),
        };
        if (currentBehaviorConfig().diagnostics || dependencies.appendRecord) {
          const record: ShadowRecord = {
            schemaVersion: 1,
            recordedAt: now().toISOString(),
            sessionId: input.sessionId,
            turnNumber: input.turnNumber,
            requestId,
            workspaceHash: behaviorWorkspaceHash(workspace),
            requestHash,
            requestCharacters: input.summary.length,
            protocolVersion: PROTOCOL_VERSION,
            packageVersion: AGENTIC_SWE_PACKAGE_VERSION,
            status: "evaluated",
            legacy: input.legacy,
            plan: projectPlan(result.plan, result.effectiveCapabilities),
            comparison,
            ...(classifierTelemetry ? { classifier: classifierTelemetry } : {}),
            diagnostics,
          };
          await appendRecord(record, workspace).catch(() => {});
        }
        return evaluation;
      } catch {
        const classifierTelemetry = suppliedClassification
          ? undefined
          : classifier.takeTelemetry?.(requestId);
        if (currentBehaviorConfig().diagnostics || dependencies.appendRecord) {
          const record: ShadowRecord = {
            schemaVersion: 1,
            recordedAt: now().toISOString(),
            sessionId: input.sessionId,
            turnNumber: input.turnNumber,
            requestId,
            workspaceHash: behaviorWorkspaceHash(workspace),
            requestHash,
            requestCharacters: input.summary.length,
            protocolVersion: PROTOCOL_VERSION,
            packageVersion: AGENTIC_SWE_PACKAGE_VERSION,
            status: "failed",
            legacy: input.legacy,
            ...(classifierTelemetry ? { classifier: classifierTelemetry } : {}),
            diagnostics: [{ code: "SHADOW_EVALUATION_FAILED", severity: "warning" }],
          };
          await appendRecord(record, workspace).catch(() => {});
        }
        return null;
      }
    },
  };
}

let defaultRuntime: ReturnType<typeof createShadowRuntime> | undefined;
const pendingEvaluations = new Set<Promise<unknown>>();

export function isShadowBehaviorEnabled(): boolean {
  const config = currentBehaviorConfig();
  return config.engine === "agentic-swe" && config.enforcement === "shadow";
}

export function isAuthoritativeBehaviorEnabled(): boolean {
  const config = currentBehaviorConfig();
  return config.engine === "agentic-swe" && config.enforcement === "authoritative";
}

export async function evaluateAuthoritativeTurn(
  input: ShadowTurnInput,
  signal?: AbortSignal,
): Promise<ShadowEvaluation | null> {
  if (!isAuthoritativeBehaviorEnabled()) return null;
  defaultRuntime ??= createShadowRuntime();
  return defaultRuntime.evaluateTurn(input, signal);
}

/** Fire-and-record: shadow work never delays or rejects the legacy model turn. */
export function scheduleShadowTurn(input: ShadowTurnInput, signal?: AbortSignal): void {
  if (!isShadowBehaviorEnabled()) return;
  defaultRuntime ??= createShadowRuntime();
  const pending = defaultRuntime.evaluateTurn(input, signal).catch(() => null);
  pendingEvaluations.add(pending);
  void pending.finally(() => pendingEvaluations.delete(pending));
}

export async function flushShadowEvaluations(): Promise<void> {
  await Promise.allSettled([...pendingEvaluations]);
}
