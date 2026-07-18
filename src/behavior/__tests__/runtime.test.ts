import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AvailableSkill } from "@agenticswe/core";
import { FakeBehaviorClassifier } from "../classifier.ts";
import {
  capabilitiesForLegacyTools,
  createShadowRuntime,
  type BehaviorPort,
} from "../runtime.ts";
import type { ShadowRecord } from "../types.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixtureRepository(version = 1): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "interference-shadow-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, ".agentic"));
  await writeFile(
    path.join(root, ".agentic", "config.yaml"),
    `version: ${version}\nagents:\n  - codex\nproject_skills_dir: .agents/skills\nselected_skills: []\nworkflow:\n  planning_gate: non-trivial\n  iteration_directory: iterazioni\n  fix_directory: fix\n  local_workspaces_gitignored: true\n`,
  );
  await writeFile(path.join(root, "AGENTS.md"), "# Fixture\n\n## Agentic Workflow\n");
  await writeFile(path.join(root, ".gitignore"), "/iterazioni\n/fix\n");
  return root;
}

async function unconfiguredRepository(): Promise<{ root: string; skills: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "interference-unconfigured-"));
  temporaryDirectories.push(root);
  const skills = path.join(root, "global-skills");
  await Promise.all([
    mkdir(path.join(root, ".git"), { recursive: true }),
    mkdir(path.join(skills, "agents-setup"), { recursive: true }),
  ]);
  await writeFile(path.join(skills, "agents-setup", "SKILL.md"), "# Setup\n");
  return { root, skills };
}

async function addPlanningRecord(root: string): Promise<string> {
  const relative = "iterazioni/01-shadow";
  const directory = path.join(root, relative);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "task.md"), "# Task\n");
  await writeFile(path.join(directory, "plan.md"), "# Plan\n");
  return relative;
}

function legacy() {
  const toolNames = ["bash", "edit", "read", "task", "write"];
  return {
    mode: "build" as const,
    toolNames,
    selectedSkills: [],
    capabilities: capabilitiesForLegacyTools(toolNames),
  };
}

function fakePort(
  value: "trivial" | "non-trivial" | "uncertain" = "non-trivial",
): BehaviorPort {
  return new FakeBehaviorClassifier({
    value,
    reasons: ["fixture"],
    confidence: 0.9,
    selectedSkills: [],
  });
}

describe("shadow runtime", () => {
  test("authoritative inputs keep informational work read-only and skip planning", async () => {
    const root = await fixtureRepository();
    const runtime = createShadowRuntime({
      workspace: root,
      classifierFactory: () => new FakeBehaviorClassifier({
        value: "trivial",
        reasons: ["informational"],
        confidence: 1,
        selectedSkills: [],
        mutationRequested: false,
      }),
      skillCandidates: [],
      globalSkillDirectories: [],
      appendRecord: async () => {},
    });
    const result = await runtime.evaluateTurn({
      sessionId: "informational",
      turnNumber: 1,
      summary: "Explain the repository layout without changing files.",
      legacy: {
        ...legacy(),
        mode: "build",
      },
    });
    expect(result?.plan.phase).toBe("execution");
    expect(result?.effectiveCapabilities).toEqual([
      "repository:read",
      "instructions:read",
      "skills:read",
    ]);
  });

  test("unconfigured non-trivial work receives only the scoped setup capability", async () => {
    const { root, skills } = await unconfiguredRepository();
    const runtime = createShadowRuntime({
      workspace: root,
      classifierFactory: () => new FakeBehaviorClassifier({
        value: "non-trivial",
        reasons: ["feature"],
        confidence: 1,
        selectedSkills: [],
      }),
      skillCandidates: [{
        name: "agents-setup",
        description: "Set up a repository.",
        source: "global",
      }],
      globalSkillDirectories: [skills],
      appendRecord: async () => {},
    });
    const result = await runtime.evaluateTurn({
      sessionId: "setup",
      turnNumber: 1,
      summary: "Set up this repository and implement a feature.",
      legacy: legacy(),
    });
    expect(result?.plan.phase).toBe("setup");
    expect(result?.plan.selectedSkills.map((skill) => skill.name)).toEqual(["agents-setup"]);
    expect(result?.effectiveCapabilities).toContain("workspace:setup-write");
    expect(result?.effectiveCapabilities).not.toContain("workspace:mutate");
    expect(result?.effectiveCapabilities).not.toContain("commands:execute");
  });

  test("evaluates a planned turn without storing request content", async () => {
    const root = await fixtureRepository();
    const planningRecord = await addPlanningRecord(root);
    const records: ShadowRecord[] = [];
    const runtime = createShadowRuntime({
      workspace: root,
      classifierFactory: () => fakePort(),
      skillCandidates: [],
      globalSkillDirectories: [],
      appendRecord: async (record) => {
        records.push(record);
      },
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });
    const summary = "Implement a cross-layer behavior change with a private token sk-test-secret.";

    const result = await runtime.evaluateTurn({
      sessionId: "session-1",
      turnNumber: 1,
      summary,
      legacy: legacy(),
      planningRecord,
    });

    expect(result?.plan.phase).toBe("execution");
    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe("evaluated");
    expect(JSON.stringify(records[0])).not.toContain(summary);
    expect(JSON.stringify(records[0])).not.toContain("sk-test-secret");
    expect(records[0]!.requestHash).toHaveLength(64);
  });

  test("reports planning and capability divergence without applying it", async () => {
    const root = await fixtureRepository();
    const before = legacy();
    const snapshot = structuredClone(before);
    const runtime = createShadowRuntime({
      workspace: root,
      classifierFactory: () => fakePort(),
      skillCandidates: [],
      globalSkillDirectories: [],
      appendRecord: async () => {},
    });

    const result = await runtime.evaluateTurn({
      sessionId: "session-2",
      turnNumber: 1,
      summary: "Refactor the runtime across multiple layers.",
      legacy: before,
    });

    expect(result?.plan.phase).toBe("planning");
    expect(result?.comparison.divergences).toContainEqual({
      category: "gate",
      key: "planning",
      legacy: "not-structurally-enforced",
      agentic: "required",
    });
    expect(before).toEqual(snapshot);
  });

  test("degrades invalid, timed-out, and aborted classifiers to diagnostics", async () => {
    const root = await fixtureRepository();
    const cases: Array<{ name: string; port: BehaviorPort; signal?: AbortSignal; code: string }> = [
      {
        name: "invalid",
        port: {
          classify: async () => ({ value: "not-valid" }),
          select: async () => [],
        },
        code: "CLASSIFIER_INVALID_OUTPUT",
      },
      {
        name: "timeout",
        port: {
          classify: async () => new Promise(() => {}),
          select: async () => [],
        },
        code: "CLASSIFIER_TIMEOUT",
      },
      {
        name: "abort",
        port: {
          classify: async () => ({ value: "trivial", reasons: ["unused"] }),
          select: async (_input, _candidates: readonly AvailableSkill[]) => [],
        },
        signal: AbortSignal.abort(),
        code: "CLASSIFIER_ABORTED",
      },
    ];

    for (const item of cases) {
      const runtime = createShadowRuntime({
        workspace: root,
        classifierFactory: () => item.port,
        skillCandidates: [],
        globalSkillDirectories: [],
        appendRecord: async () => {},
        portTimeoutMs: 10,
      });
      const result = await runtime.evaluateTurn(
        {
          sessionId: item.name,
          turnNumber: 1,
          summary: item.name,
          legacy: legacy(),
        },
        item.signal,
      );
      expect(result).not.toBeNull();
      expect(result!.diagnostics.map((diagnostic) => diagnostic.code)).toContain(item.code);
      expect(result!.plan.effectiveClassification).toBe("non-trivial");
    }
  });

  test("surfaces incompatible project configuration as a blocked plan", async () => {
    const root = await fixtureRepository(2);
    const runtime = createShadowRuntime({
      workspace: root,
      classifierFactory: () => fakePort("trivial"),
      skillCandidates: [],
      globalSkillDirectories: [],
      appendRecord: async () => {},
    });
    const result = await runtime.evaluateTurn({
      sessionId: "incompatible",
      turnNumber: 1,
      summary: "Read one file.",
      legacy: legacy(),
    });

    expect(result?.plan.phase).toBe("blocked");
    expect(result?.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "CONFIG_VERSION_INCOMPATIBLE",
    );
  });
});
