import { mkdir, writeFile } from "node:fs/promises";
import type { ToolSet } from "ai";
import { FakeBehaviorClassifier } from "../../classifier.ts";
import { capabilitiesForLegacyTools, createShadowRuntime } from "../../runtime.ts";
import { BehaviorEventRecorder } from "../../events.ts";
import { toolsForBehavior } from "../../authorization.ts";
import { write } from "../../../tools/write.ts";
import { bash } from "../../../tools/bash.ts";

const root = process.cwd();
await Promise.all([
  mkdir(".git", { recursive: true }),
  mkdir(".agentic", { recursive: true }),
  mkdir(".global-skills/iterations-planner", { recursive: true }),
]);
await writeFile(
  ".agentic/config.yaml",
  `version: 1
agents:
  - codex
project_skills_dir: .agents/skills
selected_skills:
  - name: iterations-planner
    trigger: non-trivial work
workflow:
  planning_gate: non-trivial
  iteration_directory: iterazioni
  fix_directory: fix
  local_workspaces_gitignored: true
`,
);
await writeFile("AGENTS.md", "# Fixture\n\n## Agentic Workflow\n");
await writeFile(".gitignore", "/iterazioni\n/fix\n");
await writeFile(
  ".global-skills/iterations-planner/SKILL.md",
  "---\nname: iterations-planner\ndescription: Plan non-trivial work.\n---\n# Planner\n",
);

const classifier = new FakeBehaviorClassifier({
  value: "non-trivial",
  reasons: ["cross-layer feature"],
  confidence: 1,
  selectedSkills: ["iterations-planner"],
});
const runtime = createShadowRuntime({
  workspace: root,
  classifierFactory: () => classifier,
  skillCandidates: [{
    name: "iterations-planner",
    description: "Plan non-trivial work.",
    source: "global",
  }],
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
const first = await runtime.evaluateTurn({
  sessionId: "e2e",
  turnNumber: 1,
  summary: "Implement a cross-layer feature end to end.",
  legacy,
});
if (!first || first.plan.phase !== "planning") throw new Error("expected planning phase");

const recorder = new BehaviorEventRecorder("e2e", first.plan.requestId, 1);
const planningTools = toolsForBehavior({ write }, {
  sessionId: "e2e",
  turnNumber: 1,
  requestId: first.plan.requestId,
  plan: first.plan,
  effectiveCapabilities: first.effectiveCapabilities,
  projectConfig: first.projectConfig,
  recorder,
});
const call = async <T>(tool: ToolSet[string], input: unknown): Promise<T> =>
  (tool as unknown as { execute: (input: unknown, options: unknown) => Promise<T> })
    .execute(input, { toolCallId: "e2e", messages: [] });
await call(planningTools.write!, {
  path: "iterazioni/01-feature/task.md",
  content: "# Task\n\nImplement the feature.\n",
});
await call(planningTools.write!, {
  path: "iterazioni/01-feature/plan.md",
  content: "# Plan\n\nImplement, test, document.\n",
});

const second = await runtime.evaluateTurn({
  sessionId: "e2e",
  turnNumber: 1,
  summary: "Implement a cross-layer feature end to end.",
  legacy,
  planningRecord: "iterazioni/01-feature",
  classification: first.classification,
  requestSignals: first.requestSignals,
  relevantSkills: first.relevantSkills,
  evidence: recorder.evidence(),
});
if (!second || second.plan.phase !== "execution") throw new Error("expected execution phase");

const executionTools = toolsForBehavior({ write, bash }, {
  sessionId: "e2e",
  turnNumber: 1,
  requestId: second.plan.requestId,
  plan: second.plan,
  effectiveCapabilities: second.effectiveCapabilities,
  projectConfig: second.projectConfig,
  recorder,
});
await call(executionTools.write!, {
  path: "src/feature.ts",
  content: "export const feature = true;\n",
});
await call(executionTools.write!, {
  path: "smoke.test.ts",
  content: "import { expect, test } from 'bun:test';\nimport { feature } from './src/feature';\ntest('feature', () => expect(feature).toBe(true));\n",
});
await call(executionTools.bash!, {
  command: "bun test missing.test.ts",
});

const verification = await runtime.evaluateTurn({
  sessionId: "e2e",
  turnNumber: 1,
  summary: "Implement a cross-layer feature end to end.",
  legacy,
  planningRecord: "iterazioni/01-feature",
  classification: first.classification,
  requestSignals: first.requestSignals,
  relevantSkills: first.relevantSkills,
  implementationFinished: true,
  evidence: recorder.evidence(),
});
if (!verification || verification.plan.phase !== "verification") {
  throw new Error("failed validation must keep verification outstanding");
}
const verificationTools = toolsForBehavior({ bash }, {
  sessionId: "e2e",
  turnNumber: 1,
  requestId: verification.plan.requestId,
  plan: verification.plan,
  effectiveCapabilities: verification.effectiveCapabilities,
  projectConfig: verification.projectConfig,
  recorder,
});
await call(verificationTools.bash!, {
  command: "printf 'sk-private-e2e' >/dev/null && bun test smoke.test.ts",
});

const final = await runtime.evaluateTurn({
  sessionId: "e2e",
  turnNumber: 1,
  summary: "Implement a cross-layer feature end to end.",
  legacy,
  planningRecord: "iterazioni/01-feature",
  classification: first.classification,
  requestSignals: first.requestSignals,
  relevantSkills: first.relevantSkills,
  implementationFinished: true,
  evidence: recorder.evidence(),
});
if (!final) throw new Error("missing final evaluation");

process.stdout.write(JSON.stringify({
  phases: [first.plan.phase, second.plan.phase, verification.plan.phase, final.plan.phase],
  evidence: recorder.evidence().map((item) => item.kind),
  events: recorder.events(),
  canComplete: final.plan.canComplete,
}));
