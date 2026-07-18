import { createHash } from "node:crypto";
import * as path from "node:path";
import { isValidationCommand, toolOutcome, toolSubject } from "../behavior/events.ts";

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:Bearer)\s+[A-Za-z0-9._~+\/-]+=*/gi,
];

export function redactText(value: string, maxCharacters = 12_000): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED]");
  return redacted.length > maxCharacters
    ? `${redacted.slice(0, maxCharacters)}\n[TRUNCATED]`
    : redacted;
}

export function safeToolSubject(toolName: string, input: unknown): string | undefined {
  const subject = toolSubject(toolName, input);
  if (subject) return subject;
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (toolName === "question") return "interactive-question";
  if (toolName === "todowrite") return "task-state";
  if (typeof value.path === "string") {
    const relative = path.relative(process.cwd(), path.resolve(process.cwd(), value.path));
    return relative.startsWith("../") ? "outside-workspace" : relative.replaceAll(path.sep, "/");
  }
  return undefined;
}

export function safeToolKind(
  toolName: string,
  input: unknown,
): "read" | "mutation" | "validation" | "interaction" | "other" {
  if (["read", "ls", "glob", "grep", "webfetch"].includes(toolName)) return "read";
  if (toolName === "write" || toolName === "edit") return "mutation";
  if (toolName === "bash" && isValidationCommand(input)) return "validation";
  if (toolName === "question" || toolName === "todowrite") return "interaction";
  return "other";
}

export function safeToolOutcome(output: string, isError: boolean): {
  outcome: "succeeded" | "failed" | "denied" | "refused";
  exitCode?: number;
} {
  if (isError) return { outcome: "failed" };
  const observed = toolOutcome(output);
  const outcome = observed.outcome === "aborted" || observed.outcome === "pending"
    ? "failed"
    : observed.outcome;
  return {
    outcome,
    ...(observed.exitCode !== undefined ? { exitCode: observed.exitCode } : {}),
  };
}

export function stableRunId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 20);
}
