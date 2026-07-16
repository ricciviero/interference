import { mkdir, writeFile } from "node:fs/promises";
import type { ToolSet } from "ai";
import { FakeBehaviorClassifier } from "../../classifier.ts";
import { toolsForBehavior } from "../../authorization.ts";
import { BehaviorEventRecorder } from "../../events.ts";
import { capabilitiesForLegacyTools, createShadowRuntime } from "../../runtime.ts";
import { write } from "../../../tools/write.ts";
import { bash } from "../../../tools/bash.ts";

await Promise.all([
  mkdir(".git", { recursive: true }),
  mkdir(".global-skills/agents-setup", { recursive: true }),
  mkdir(".global-skills/iterations-planner", { recursive: true }),
]);
await Promise.all([
  writeFile(".global-skills/agents-setup/SKILL.md", "# Setup\n"),
  writeFile(".global-skills/iterations-planner/SKILL.md", "# Planner\n"),
]);

const classifier = new FakeBehaviorClassifier({
  value: "non-trivial",
  reasons: ["unconfigured cross-layer feature"],
  confidence: 1,
  selectedSkills: ["agents-setup", "iterations-planner"],
  mutationRequested: true,
});
const runtime = createShadowRuntime({
  workspace: process.cwd(),
  classifierFactory: () => classifier,
  skillCandidates: [
    { name: "agents-setup", description: "Set up a repository.", source: "global" },
    { name: "iterations-planner", description: "Plan non-trivial work.", source: "global" },
  ],
  globalSkillDirectories: [".global-skills"],
  appendRecord: async () => {},
});
const toolNames = ["bash", "edit", "read", "task", "write"];
const legacy = {
  mode: "build" as const,
  toolNames,
  selectedSkills: [] as string[],
  capabilities: capabilitiesForLegacyTools(toolNames),
};
const summary = "Set up this repository and implement a tested feature.";
const evaluate = (input: Record<string, unknown> = {}) => runtime.evaluateTurn({
  sessionId: "onboarding-e2e",
  turnNumber: 1,
  summary,
  legacy,
  ...input,
});
const call = async <T>(tool: ToolSet[string], input: unknown): Promise<T> =>
  (tool as unknown as { execute: (value: unknown, options: unknown) => Promise<T> })
    .execute(input, { toolCallId: "onboarding-e2e", messages: [] });

const setup = await evaluate();
if (!setup || setup.plan.phase !== "setup") throw new Error("expected setup phase");
const recorder = new BehaviorEventRecorder("onboarding-e2e", setup.plan.requestId, 1);
const setupTools = toolsForBehavior({ write }, {
  sessionId: "onboarding-e2e",
  turnNumber: 1,
  requestId: setup.plan.requestId,
  plan: setup.plan,
  effectiveCapabilities: setup.effectiveCapabilities,
  projectConfig: setup.projectConfig,
  recorder,
});
await call(setupTools.write!, {
  path: "AGENTS.md",
  content: "# Fixture\n\n## Agentic Workflow\n",
});
await call(setupTools.write!, {
  path: ".agentic/config.yaml",
  content: `version: 1
agents:
  - codex
project_skills_dir: .agents/skills
selected_skills:
  - name: agents-setup
    trigger: onboarding
  - name: iterations-planner
    trigger: non-trivial work
workflow:
  planning_gate: non-trivial
  iteration_directory: iterazioni
  fix_directory: fix
  local_workspaces_gitignored: true
`,
});
await call(setupTools.write!, { path: ".gitignore", content: "/iterazioni\n/fix\n" });

const shared = {
  classification: setup.classification,
  requestSignals: setup.requestSignals,
  relevantSkills: setup.relevantSkills,
};
const planning = await evaluate({ ...shared, evidence: recorder.evidence() });
if (!planning || planning.plan.phase !== "planning") throw new Error("expected planning phase");
const planningTools = toolsForBehavior({ write }, {
  sessionId: "onboarding-e2e",
  turnNumber: 1,
  requestId: planning.plan.requestId,
  plan: planning.plan,
  effectiveCapabilities: planning.effectiveCapabilities,
  projectConfig: planning.projectConfig,
  recorder,
});
await call(planningTools.write!, {
  path: "iterazioni/01-feature/task.md",
  content: "# Task\n\nImplement the feature.\n",
});
await call(planningTools.write!, {
  path: "iterazioni/01-feature/plan.md",
  content: "# Plan\n\nImplement, test, and document.\n",
});

const execution = await evaluate({
  ...shared,
  planningRecord: "iterazioni/01-feature",
  evidence: recorder.evidence(),
});
if (!execution || execution.plan.phase !== "execution") throw new Error("expected execution phase");
const executionTools = toolsForBehavior({ write, bash }, {
  sessionId: "onboarding-e2e",
  turnNumber: 1,
  requestId: execution.plan.requestId,
  plan: execution.plan,
  effectiveCapabilities: execution.effectiveCapabilities,
  projectConfig: execution.projectConfig,
  recorder,
});
await call(executionTools.write!, {
  path: "feature.ts",
  content: "export const feature = true;\n",
});
await call(executionTools.write!, {
  path: "feature.test.ts",
  content: "import { expect, test } from 'bun:test';\nimport { feature } from './feature';\ntest('feature', () => expect(feature).toBe(true));\n",
});
await call(executionTools.bash!, { command: "bun test missing.test.ts" });

const verification = await evaluate({
  ...shared,
  planningRecord: "iterazioni/01-feature",
  implementationFinished: true,
  evidence: recorder.evidence(),
});
if (!verification || verification.plan.phase !== "verification") {
  throw new Error("failed validation must require verification");
}
const verificationTools = toolsForBehavior({ bash }, {
  sessionId: "onboarding-e2e",
  turnNumber: 1,
  requestId: verification.plan.requestId,
  plan: verification.plan,
  effectiveCapabilities: verification.effectiveCapabilities,
  projectConfig: verification.projectConfig,
  recorder,
});
await call(verificationTools.bash!, { command: "bun test feature.test.ts" });

const completion = await evaluate({
  ...shared,
  planningRecord: "iterazioni/01-feature",
  implementationFinished: true,
  evidence: recorder.evidence(),
});
if (!completion) throw new Error("missing completion evaluation");

process.stdout.write(JSON.stringify({
  phases: [setup.plan.phase, planning.plan.phase, execution.plan.phase, verification.plan.phase, completion.plan.phase],
  evidence: recorder.evidence().map((item) => item.kind),
  events: recorder.events(),
  canComplete: completion.plan.canComplete,
}));
