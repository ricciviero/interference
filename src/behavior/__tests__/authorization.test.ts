import { describe, expect, test } from "bun:test";
import {
  PROTOCOL_VERSION,
  type BehaviorPlan,
  type Capability,
  type ProjectConfig,
} from "@agenticswe/core";
import type { ToolSet } from "ai";
import { authorizeBehaviorTool, toolsForBehavior } from "../authorization.ts";
import { runWithBehaviorExecution, type BehaviorExecutionContext } from "../context.ts";
import { decide } from "../../permissions.ts";

const config: ProjectConfig = {
  version: 1,
  agents: ["codex"],
  project_skills_dir: ".agents/skills",
  selected_skills: [],
  workflow: {
    planning_gate: "non-trivial",
    iteration_directory: "iterazioni",
    fix_directory: "fix",
    local_workspaces_gitignored: true,
  },
};

function context(
  phase: BehaviorPlan["phase"],
  capabilities: Capability[],
  projectConfig: ProjectConfig | null = config,
): BehaviorExecutionContext {
  return {
    sessionId: "session",
    turnNumber: 1,
    requestId: "request",
    effectiveCapabilities: capabilities,
    projectConfig,
    plan: {
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request",
      phase,
      effectiveClassification: "non-trivial",
      requiredGates: [],
      selectedSkills: [],
      requestedCapabilities: capabilities,
      completionCriteria: [],
      canComplete: false,
      reasons: ["TASK_NON_TRIVIAL"],
      diagnostics: [],
    },
  };
}

describe("authoritative tool authorization", () => {
  test("setup writes are scoped and cannot execute commands", () => {
    const setup = context("setup", ["repository:read", "workspace:setup-write"], null);
    expect(authorizeBehaviorTool("write", "AGENTS.md", setup).allowed).toBe(true);
    expect(authorizeBehaviorTool("write", ".agentic/config.yaml", setup).allowed).toBe(true);
    expect(authorizeBehaviorTool("write", "src/index.ts", setup).allowed).toBe(false);
    expect(authorizeBehaviorTool("write", "../outside", setup).allowed).toBe(false);
    expect(authorizeBehaviorTool("bash", "touch src/index.ts", setup).allowed).toBe(false);
  });

  test("planning writes are limited to configured local workspaces", () => {
    const planning = context("planning", ["repository:read", "workspace:plan-write"]);
    expect(authorizeBehaviorTool("edit", "iterazioni/45/plan.md", planning).allowed).toBe(true);
    expect(authorizeBehaviorTool("write", "fix/12/task.md", planning).allowed).toBe(true);
    expect(authorizeBehaviorTool("write", ".gitignore", planning).allowed).toBe(true);
    expect(authorizeBehaviorTool("edit", "README.md", planning).allowed).toBe(false);
    expect(authorizeBehaviorTool("task", "general", planning).allowed).toBe(false);
  });

  test("effective execution capabilities expose mapped tools only", () => {
    const execution = context("execution", [
      "repository:read",
      "workspace:mutate",
      "commands:execute",
    ]);
    const tools = toolsForBehavior(
      {
        read: {} as ToolSet[string],
        write: {} as ToolSet[string],
        bash: {} as ToolSet[string],
        task: {} as ToolSet[string],
        question: {} as ToolSet[string],
      },
      execution,
    );
    expect(Object.keys(tools).sort()).toEqual(["bash", "question", "read", "write"]);
  });

  test("wrapped stale calls retain their immutable planning context", async () => {
    const capabilities: Capability[] = ["repository:read", "workspace:plan-write"];
    const planning = context("planning", capabilities);
    const tools = toolsForBehavior(
      {
        write: {
          execute: async ({ path }: { path: string }) => decide("write", path),
        } as unknown as ToolSet[string],
      },
      planning,
    );
    capabilities.push("workspace:mutate");
    const result = await (tools.write as unknown as {
      execute: (input: { path: string }) => Promise<string>;
    }).execute({ path: "src/injected.ts" });
    expect(result).toContain("denied by Agentic SWE policy");
  });

  test("parallel execution contexts remain isolated", async () => {
    const execution = context("execution", ["workspace:mutate"]);
    const planning = context("planning", ["workspace:plan-write"]);
    const [mutation, planWrite] = await Promise.all([
      runWithBehaviorExecution(execution, async () => {
        await Promise.resolve();
        return decide("write", "src/index.ts");
      }),
      runWithBehaviorExecution(planning, async () => {
        await Promise.resolve();
        return decide("write", "src/index.ts");
      }),
    ]);
    expect(mutation).toBe("allow");
    expect(planWrite).toBe("deny");
  });
});
