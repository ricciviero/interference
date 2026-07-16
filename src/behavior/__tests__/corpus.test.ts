import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FakeBehaviorClassifier } from "../classifier.ts";
import {
  formatShadowSummary,
  summarizeShadowRecords,
} from "../diagnostics.ts";
import {
  capabilitiesForLegacyTools,
  createShadowRuntime,
  type BehaviorPort,
} from "../runtime.ts";
import type { ShadowRecord } from "../types.ts";

interface CorpusCase {
  id: string;
  summary: string;
  classification: "trivial" | "non-trivial" | "uncertain";
  mode: "plan" | "build";
  planned: boolean;
  eligible: boolean;
  unconfigured?: boolean;
  lighterProcessReason?: string;
  selectedSkills: string[];
}

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function createCorpusRepository(): Promise<{
  workspace: string;
  unconfigured: string;
  skills: string;
  planningRecord: string;
}> {
  root = await mkdtemp(path.join(os.tmpdir(), "interference-corpus-"));
  const workspace = path.join(root, "configured");
  const unconfigured = path.join(root, "unconfigured");
  const skills = path.join(root, "global-skills");
  await mkdir(path.join(workspace, ".git"), { recursive: true });
  await mkdir(path.join(workspace, ".agentic"), { recursive: true });
  await mkdir(path.join(unconfigured, ".git"), { recursive: true });
  await mkdir(path.join(skills, "interference-tool"), { recursive: true });
  await writeFile(
    path.join(skills, "interference-tool", "SKILL.md"),
    "---\nname: interference-tool\ndescription: Change an Interference tool safely.\n---\n",
  );
  await writeFile(
    path.join(workspace, ".agentic", "config.yaml"),
    "version: 1\nagents:\n  - codex\nproject_skills_dir: .agents/skills\nselected_skills:\n  - name: interference-tool\n    trigger: changes to Interference tools\nworkflow:\n  planning_gate: non-trivial\n  iteration_directory: iterazioni\n  fix_directory: fix\n  local_workspaces_gitignored: true\n",
  );
  await writeFile(path.join(workspace, "AGENTS.md"), "# Fixture\n\n## Agentic Workflow\n");
  await writeFile(path.join(workspace, ".gitignore"), "/iterazioni\n/fix\n");
  const planningRecord = "iterazioni/01-corpus";
  await mkdir(path.join(workspace, planningRecord), { recursive: true });
  await writeFile(path.join(workspace, planningRecord, "task.md"), "# Task\n");
  await writeFile(path.join(workspace, planningRecord, "plan.md"), "# Plan\n");
  return { workspace, unconfigured, skills, planningRecord };
}

function toolsForMode(mode: CorpusCase["mode"]): string[] {
  const readOnly = ["glob", "grep", "ls", "question", "read", "task", "todowrite", "webfetch"];
  return mode === "build" ? [...readOnly, "bash", "edit", "write"].sort() : readOnly;
}

function corpusPort(item: CorpusCase): BehaviorPort {
  const fake = new FakeBehaviorClassifier({
    value: item.classification,
    reasons: [`corpus:${item.id}`],
    confidence: 0.9,
    selectedSkills: item.selectedSkills,
  });
  return Object.assign(fake, {
    takeRequestSignals: () => ({
      explicitOnboarding: item.unconfigured ?? false,
      explicitLighterProcess: item.lighterProcessReason !== undefined,
      ...(item.lighterProcessReason
        ? { lighterProcessReason: item.lighterProcessReason }
        : {}),
    }),
  });
}

describe("shadow divergence corpus", () => {
  test("produces a readable report and never applies Agentic capabilities", async () => {
    const fixture = await createCorpusRepository();
    const corpus = JSON.parse(
      await readFile(path.join(import.meta.dir, "fixtures", "shadow-corpus.json"), "utf8"),
    ) as CorpusCase[];
    const records: ShadowRecord[] = [];

    for (const [index, item] of corpus.entries()) {
      if (!item.eligible) continue;
      const workspace = item.unconfigured ? fixture.unconfigured : fixture.workspace;
      const toolNames = toolsForMode(item.mode);
      const legacy = {
        mode: item.mode,
        toolNames,
        selectedSkills: [...item.selectedSkills],
        capabilities: capabilitiesForLegacyTools(toolNames),
      };
      const legacySnapshot = structuredClone(legacy);
      const runtime = createShadowRuntime({
        workspace,
        classifierFactory: () => corpusPort(item),
        skillCandidates: [
          {
            name: "interference-tool",
            description: "Change an Interference tool safely.",
            source: "global",
          },
        ],
        globalSkillDirectories: [fixture.skills],
        appendRecord: async (record) => {
          records.push(record);
        },
      });

      const result = await runtime.evaluateTurn({
        sessionId: "corpus",
        turnNumber: index + 1,
        summary: item.summary,
        legacy,
        ...(item.planned && !item.unconfigured
          ? { planningRecord: fixture.planningRecord }
          : {}),
      });

      expect(result).not.toBeNull();
      expect(legacy).toEqual(legacySnapshot);
    }

    const report = summarizeShadowRecords(records);
    const readable = formatShadowSummary(report);
    expect(records).toHaveLength(corpus.filter((item) => item.eligible).length);
    expect(report.failed).toBe(0);
    expect(report.divergent).toBeGreaterThan(0);
    expect(readable).toContain("Agentic SWE shadow");
    expect(readable).toContain("divergent");
    expect(records.some((record) => record.plan?.phase === "setup")).toBe(true);
    expect(records.some((record) => record.plan?.gates.some((gate) => gate.status === "waived"))).toBe(true);
    expect(records.some((record) => record.plan?.selectedSkills.includes("interference-tool"))).toBe(true);
  });
});
