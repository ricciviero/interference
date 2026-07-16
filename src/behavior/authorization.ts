import * as path from "node:path";
import type { Capability } from "@agenticswe/core";
import type { ToolSet } from "ai";
import {
  currentBehaviorExecution,
  runWithBehaviorExecution,
  type BehaviorExecutionContext,
} from "./context.ts";
import {
  capabilityForTool,
  isDocumentationPath,
  isValidationCommand,
  mutationEvidenceKind,
  rawAuthorizationSubject,
  toolOutcome,
  toolSubject,
} from "./events.ts";

export type BehaviorAuthorization =
  | { allowed: true }
  | { allowed: false; reason: string };

const READ_TOOLS = new Set(["read", "ls", "glob", "grep", "webfetch"]);
const HOST_STATE_TOOLS = new Set(["todowrite", "question"]);

function hasCapability(
  capabilities: readonly Capability[],
  capability: Capability,
): boolean {
  return capabilities.includes(capability);
}

function normalizedWorkspacePath(subject: string): string | null {
  const absolute = path.resolve(process.cwd(), subject);
  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
  if (relative === "" || relative === ".") return ".";
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

function pathWithin(relative: string, root: string): boolean {
  const normalizedRoot = root.replace(/^\.\//, "").replace(/\/$/, "");
  return relative === normalizedRoot || relative.startsWith(`${normalizedRoot}/`);
}

function setupPathAllowed(relative: string): boolean {
  return (
    relative === "AGENTS.md" ||
    relative === "CLAUDE.md" ||
    relative === ".gitignore" ||
    pathWithin(relative, ".agentic") ||
    pathWithin(relative, ".agents/skills") ||
    pathWithin(relative, ".claude/skills") ||
    pathWithin(relative, ".codex/skills")
  );
}

function planningPathAllowed(
  relative: string,
  context: BehaviorExecutionContext,
): boolean {
  if (relative === ".gitignore") return true;
  const workflow = context.projectConfig?.workflow;
  if (!workflow) return false;
  return (
    pathWithin(relative, workflow.iteration_directory) ||
    pathWithin(relative, workflow.fix_directory)
  );
}

export function authorizeBehaviorTool(
  toolName: string,
  subject: string,
  context = currentBehaviorExecution(),
): BehaviorAuthorization {
  if (!context) return { allowed: true };
  const capabilities = context.effectiveCapabilities;

  if (READ_TOOLS.has(toolName)) {
    return hasCapability(capabilities, "repository:read")
      ? { allowed: true }
      : { allowed: false, reason: "repository:read is not effective" };
  }
  if (HOST_STATE_TOOLS.has(toolName)) return { allowed: true };
  if (toolName === "bash") {
    return hasCapability(capabilities, "commands:execute")
      ? { allowed: true }
      : { allowed: false, reason: "commands:execute is not effective" };
  }
  if (toolName === "task") {
    return hasCapability(capabilities, "subagents:invoke")
      ? { allowed: true }
      : { allowed: false, reason: "subagents:invoke is not effective" };
  }
  if (toolName !== "write" && toolName !== "edit") return { allowed: false, reason: "tool is not mapped" };

  const relative = normalizedWorkspacePath(subject);
  if (!relative) return { allowed: false, reason: "path is outside the workspace" };
  if (hasCapability(capabilities, "workspace:mutate")) return { allowed: true };
  if (hasCapability(capabilities, "workspace:setup-write")) {
    return setupPathAllowed(relative)
      ? { allowed: true }
      : { allowed: false, reason: "path is outside the setup scope" };
  }
  if (hasCapability(capabilities, "workspace:plan-write")) {
    return planningPathAllowed(relative, context)
      ? { allowed: true }
      : { allowed: false, reason: "path is outside the planning scope" };
  }
  return { allowed: false, reason: "no effective workspace write capability" };
}

function toolVisible(name: string, context: BehaviorExecutionContext): boolean {
  return authorizeBehaviorTool(name, ".", context).allowed ||
    ((name === "write" || name === "edit") &&
      context.effectiveCapabilities.some((capability) =>
        capability === "workspace:setup-write" ||
        capability === "workspace:plan-write" ||
        capability === "workspace:mutate"
      ));
}

/**
 * Tool exposure is the UX boundary; the wrapped execute is the stale/concurrent
 * call boundary. Both use the same immutable per-turn context.
 */
export function toolsForBehavior(
  tools: ToolSet,
  context: BehaviorExecutionContext,
): ToolSet {
  const scopedContext = Object.freeze({
    ...context,
    effectiveCapabilities: Object.freeze([...context.effectiveCapabilities]),
  });
  const result: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    if (!toolVisible(name, scopedContext)) continue;
    const original = definition as typeof definition & {
      execute?: (...args: unknown[]) => unknown;
    };
    result[name] = original.execute
      ? ({
          ...original,
          execute: async (...args: unknown[]) =>
            runWithBehaviorExecution(scopedContext, async () => {
              const input = args[0];
              const rawSubject = rawAuthorizationSubject(name, input);
              const subject = toolSubject(name, input);
              const capability =
                name === "write" || name === "edit"
                  ? scopedContext.plan.phase === "setup"
                    ? "workspace:setup-write"
                    : scopedContext.plan.phase === "planning"
                      ? "workspace:plan-write"
                      : "workspace:mutate"
                  : capabilityForTool(name);
              await scopedContext.recorder?.record({
                type: "tool.requested",
                outcome: "pending",
                ...(capability ? { capability } : {}),
                ...(subject ? { subject } : {}),
              });
              const authorization = authorizeBehaviorTool(name, rawSubject, scopedContext);
              if (!authorization.allowed) {
                await scopedContext.recorder?.record({
                  type: "tool.denied",
                  outcome: "denied",
                  ...(capability ? { capability } : {}),
                  ...(subject ? { subject } : {}),
                });
                return `Error: ${name} denied by Agentic SWE policy (${authorization.reason})`;
              }
              await scopedContext.recorder?.record({
                type: "tool.allowed",
                outcome: "succeeded",
                ...(capability ? { capability } : {}),
                ...(subject ? { subject } : {}),
              });
              try {
                const output = await original.execute!(...args);
                const observed = toolOutcome(output);
                await scopedContext.recorder?.record({
                  type:
                    observed.outcome === "refused"
                      ? "tool.refused"
                      : observed.outcome === "denied"
                        ? "tool.denied"
                        : observed.outcome === "failed"
                          ? "tool.failed"
                          : "tool.completed",
                  outcome: observed.outcome,
                  ...(capability ? { capability } : {}),
                  ...(subject ? { subject } : {}),
                  ...(observed.exitCode !== undefined
                    ? { exitCode: observed.exitCode }
                    : {}),
                });
                if (
                  observed.outcome === "succeeded" &&
                  (name === "write" || name === "edit") &&
                  subject
                ) {
                  await scopedContext.recorder?.record({
                    type: "workspace.mutated",
                    outcome: "succeeded",
                    capability,
                    subject,
                    evidenceKind: mutationEvidenceKind(subject, scopedContext.plan.phase),
                  });
                  if (isDocumentationPath(subject)) {
                    await scopedContext.recorder?.record({
                      type: "documentation.recorded",
                      outcome: "succeeded",
                      subject,
                      evidenceKind: "documentation",
                    });
                  }
                }
                if (name === "bash" && isValidationCommand(input)) {
                  await scopedContext.recorder?.record({
                    type: "validation.recorded",
                    outcome: observed.outcome,
                    ...(subject ? { subject } : {}),
                    ...(observed.exitCode !== undefined
                      ? { exitCode: observed.exitCode }
                      : {}),
                    evidenceKind: "validation",
                  });
                }
                return output;
              } catch (error) {
                await scopedContext.recorder?.record({
                  type: "tool.failed",
                  outcome: "failed",
                  ...(capability ? { capability } : {}),
                  ...(subject ? { subject } : {}),
                });
                throw error;
              }
            }),
        } as typeof definition)
      : definition;
  }
  return result;
}
