import { createHash } from "node:crypto";
import * as path from "node:path";
import {
  PROTOCOL_VERSION,
  evidenceFromEvents,
  recordEvent,
  type Capability,
  type Evidence,
  type EvidenceKind,
  type HostEventOutcome,
  type HostEventType,
  type HostExecutionEvent,
} from "@agenticswe/core";

type EventChangeHandler = (
  events: readonly HostExecutionEvent[],
  evidence: readonly Evidence[],
) => void | Promise<void>;

export class BehaviorEventRecorder {
  #events: HostExecutionEvent[];
  #changeQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly sessionId: string,
    readonly requestId: string,
    readonly turnNumber: number,
    initial: readonly HostExecutionEvent[] = [],
    private readonly onChange?: EventChangeHandler,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#events = initial.map((event) => ({ ...event }));
  }

  events(): HostExecutionEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  evidence(): Evidence[] {
    return evidenceFromEvents(this.#events);
  }

  async record(input: {
    type: HostEventType;
    outcome: HostEventOutcome;
    capability?: Capability;
    subject?: string;
    exitCode?: number;
    evidenceKind?: EvidenceKind;
  }): Promise<HostExecutionEvent> {
    const sequence = this.#events.length + 1;
    const event: HostExecutionEvent = {
      schemaVersion: 1,
      protocolVersion: PROTOCOL_VERSION,
      id: `${this.sessionId}:${this.turnNumber}:${sequence}:${input.type}`,
      sessionId: this.sessionId,
      requestId: this.requestId,
      turnNumber: this.turnNumber,
      sequence,
      type: input.type,
      outcome: input.outcome,
      occurredAt: this.now().toISOString(),
      ...(input.capability ? { capability: input.capability } : {}),
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
      ...(input.evidenceKind ? { evidenceKind: input.evidenceKind } : {}),
    };
    this.#events = recordEvent(this.#events, event);
    const events = this.events();
    const evidence = this.evidence();
    this.#changeQueue = this.#changeQueue.then(async () => {
      await this.onChange?.(events, evidence);
    });
    await this.#changeQueue;
    return event;
  }
}

export function capabilityForTool(toolName: string): Capability | undefined {
  if (["read", "ls", "glob", "grep", "webfetch"].includes(toolName)) return "repository:read";
  if (toolName === "bash") return "commands:execute";
  if (toolName === "task") return "subagents:invoke";
  if (toolName === "write" || toolName === "edit") return "workspace:mutate";
  return undefined;
}

export function toolSubject(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if ((toolName === "write" || toolName === "edit") && typeof value.path === "string") {
    const absolute = path.resolve(process.cwd(), value.path);
    const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
    return relative.startsWith("../") ? "outside-workspace" : relative;
  }
  if (toolName === "bash" && typeof value.command === "string") {
    const executable = value.command.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9_.-]/g, "") || "command";
    const hash = createHash("sha256").update(value.command).digest("hex").slice(0, 12);
    return `${executable}#${hash}`;
  }
  if (toolName === "task" && typeof value.subagent_type === "string") {
    return value.subagent_type.slice(0, 80);
  }
  return undefined;
}

export function rawAuthorizationSubject(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const value = input as Record<string, unknown>;
  if ((toolName === "write" || toolName === "edit") && typeof value.path === "string") return value.path;
  if (toolName === "bash" && typeof value.command === "string") return value.command;
  if (toolName === "task" && typeof value.subagent_type === "string") return value.subagent_type;
  return "";
}

export function isValidationCommand(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const command = (input as Record<string, unknown>).command;
  if (typeof command !== "string") return false;
  return /(?:^|\s)(?:test|check|typecheck|lint|build|verify|vitest|jest|pytest|cargo\s+test|go\s+test|tsc)(?:\s|$|:)/i.test(command);
}

export function toolOutcome(output: unknown): {
  outcome: HostEventOutcome;
  exitCode?: number;
} {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  if (/refused by user/i.test(text)) return { outcome: "refused" };
  if (/denied by (?:policy|permission)/i.test(text)) return { outcome: "denied" };
  if (/<task\b[^>]*\bstate="completed"/i.test(text)) return { outcome: "succeeded" };
  if (/<task\b[^>]*\bstate="error"/i.test(text)) return { outcome: "failed" };
  const exit = text.match(/exit code:\s*(\d+)/i);
  if (exit) {
    const exitCode = Number(exit[1]);
    return { outcome: exitCode === 0 ? "succeeded" : "failed", exitCode };
  }
  if (/\b(?:error|failed|timed out)\b/i.test(text)) return { outcome: "failed" };
  return { outcome: "succeeded", exitCode: 0 };
}

export function mutationEvidenceKind(pathname: string, phase: string): EvidenceKind {
  if (phase === "setup") return "setup";
  if (phase === "planning") return "planning";
  return "implementation";
}

export function isDocumentationPath(pathname: string): boolean {
  return /^(?:README(?:\.[^/]*)?|CHANGELOG(?:\.[^/]*)?|AGENTS\.md|CLAUDE\.md|docs\/)/i.test(pathname);
}
