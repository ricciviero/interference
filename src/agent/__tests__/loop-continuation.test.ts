import { describe, test, expect } from "bun:test";
import {
  canResumeBehaviorSnapshot,
  nextLoopAction,
  nextProtocolLoopAction,
  planningRecordFromEvents,
  protocolCompletionGuardApplies,
  mergeObservedSkills,
  shouldScheduleShadowForTurn,
} from "../loop.ts";
import {
  PROTOCOL_VERSION,
  type HostExecutionEvent,
  type ProjectConfig,
} from "@agenticswe/core";
import { maxStepsPerCall, maxContinuations } from "../../config.ts";

// Base: primary turn, no pending todos, first round, not aborted.
const base = {
  isPrimaryTurn: true,
  hasPendingTodos: false,
  round: 0,
  nudges: 0,
  maxContinuations: 25,
  maxNudges: 3,
  aborted: false,
};

describe("nextLoopAction (fix/09 continuation loop)", () => {
  test("cut-off (tool-calls) → continue: the turn is NOT truncated mid-work (the old bug)", () => {
    expect(nextLoopAction({ ...base, finishReason: "tool-calls" })).toBe("continue");
  });

  test("cut-off (length) → continue", () => {
    expect(nextLoopAction({ ...base, finishReason: "length" })).toBe("continue");
  });

  test("cut-off but continuation backstop reached → limit (surfaced, not silent)", () => {
    expect(nextLoopAction({ ...base, finishReason: "tool-calls", round: 25 })).toBe("limit");
  });

  test("natural stop + primary + pending todos + under nudge cap → nudge", () => {
    expect(nextLoopAction({ ...base, finishReason: "stop", hasPendingTodos: true })).toBe("nudge");
  });

  test("natural stop + primary + pending todos but nudge cap reached → stop", () => {
    expect(nextLoopAction({ ...base, finishReason: "stop", hasPendingTodos: true, nudges: 3 })).toBe("stop");
  });

  test("natural stop + no pending todos → stop (normal turn end)", () => {
    expect(nextLoopAction({ ...base, finishReason: "stop", hasPendingTodos: false })).toBe("stop");
  });

  test("subagent never auto-nudges on the shared todo list", () => {
    expect(
      nextLoopAction({ ...base, finishReason: "stop", hasPendingTodos: true, isPrimaryTurn: false }),
    ).toBe("stop");
  });

  test("aborted → stop regardless of finishReason", () => {
    expect(nextLoopAction({ ...base, finishReason: "tool-calls", aborted: true })).toBe("stop");
  });

  test("nudge wanted but backstop reached → limit", () => {
    expect(nextLoopAction({ ...base, finishReason: "stop", hasPendingTodos: true, round: 25 })).toBe("limit");
  });
});

describe("Agentic SWE shadow hook", () => {
  const context = { sessionId: "session", turnNumber: 1 };

  test("is eligible only for primary turns", () => {
    expect(shouldScheduleShadowForTurn(undefined, context)).toBe(true);
    expect(shouldScheduleShadowForTurn("review system", context)).toBe(false);
    expect(shouldScheduleShadowForTurn("subagent system", context)).toBe(false);
  });

  test("does nothing when the host did not provide session context", () => {
    expect(shouldScheduleShadowForTurn(undefined, undefined)).toBe(false);
  });
});

describe("Agentic SWE authoritative continuation", () => {
  const baseProtocol = {
    naturalStop: true,
    needsContinuation: true,
    refusedOrAborted: false,
    protocolNudges: 0,
    maxProtocolNudges: 3,
    round: 0,
    maxContinuations: 25,
  };

  test("nudges outstanding hard requirements with a dedicated bounded budget", () => {
    expect(nextProtocolLoopAction(baseProtocol)).toBe("nudge");
    expect(nextProtocolLoopAction({ ...baseProtocol, protocolNudges: 3 })).toBe("limit");
    expect(nextProtocolLoopAction({ ...baseProtocol, round: 25 })).toBe("limit");
  });

  test("abort/refusal and non-natural stops are never protocol-nudged", () => {
    expect(nextProtocolLoopAction({ ...baseProtocol, refusedOrAborted: true })).toBe("stop");
    expect(nextProtocolLoopAction({ ...baseProtocol, naturalStop: false })).toBe("stop");
  });

  test("preserves skills observed in earlier workflow phases", () => {
    expect(mergeObservedSkills(
      ["iterations-planner"],
      [{ name: "project-review" }, { name: "iterations-planner" }],
    )).toEqual(["iterations-planner", "project-review"]);
    expect(mergeObservedSkills(["iterations-planner"], [])).toEqual([
      "iterations-planner",
    ]);
  });

  test("derives a configured planning record only from successful scoped evidence", () => {
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
    const event = {
      schemaVersion: 1,
      protocolVersion: PROTOCOL_VERSION,
      id: "event-1",
      sessionId: "session",
      requestId: "request",
      turnNumber: 1,
      sequence: 1,
      type: "workspace.mutated",
      outcome: "succeeded",
      occurredAt: "2026-07-16T12:00:00.000Z",
      subject: "iterazioni/46-delivery/plan.md",
      evidenceKind: "planning",
    } satisfies HostExecutionEvent;
    expect(planningRecordFromEvents([event], config)).toBe("iterazioni/46-delivery");
    expect(planningRecordFromEvents([{ ...event, outcome: "failed" }], config)).toBeUndefined();
  });

  test("never carries planning evidence into a later user turn", () => {
    expect(canResumeBehaviorSnapshot(3, 3, "request-a", "request-a")).toBe(true);
    expect(canResumeBehaviorSnapshot(3, 4, "request-a", "request-a")).toBe(false);
    expect(canResumeBehaviorSnapshot(3, 3, "request-a", "request-b")).toBe(false);
    expect(canResumeBehaviorSnapshot(undefined, 1, undefined, "request-a")).toBe(false);
    expect(canResumeBehaviorSnapshot(3, 3, "request-a", "request-a", [{
      schemaVersion: 1,
      protocolVersion: PROTOCOL_VERSION,
      id: "event-1",
      sessionId: "session",
      requestId: "request-a",
      turnNumber: 3,
      sequence: 1,
      type: "turn.aborted",
      outcome: "aborted",
      occurredAt: "2026-07-16T12:00:00.000Z",
    }])).toBe(false);
  });

  test("requires evidence even for a trivial mutation, but never for read-only work", () => {
    expect(protocolCompletionGuardApplies(true, "execution")).toBe(true);
    expect(protocolCompletionGuardApplies(true, "verification")).toBe(true);
    expect(protocolCompletionGuardApplies(false, "execution")).toBe(false);
    expect(protocolCompletionGuardApplies(true, "completion")).toBe(false);
  });
});

describe("agent loop budget (fix/09 config)", () => {
  function withEnv(key: string, value: string | undefined, fn: () => void) {
    const prev = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
      fn();
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }

  test("defaults when no env set", () => {
    withEnv("INTERFERENCE_MAX_STEPS", undefined, () =>
      withEnv("INTERFERENCE_MAX_CONTINUATIONS", undefined, () => {
        expect(maxStepsPerCall()).toBe(100);
        expect(maxContinuations()).toBe(25);
      }),
    );
  });

  test("env overrides the default", () => {
    withEnv("INTERFERENCE_MAX_STEPS", "300", () => {
      expect(maxStepsPerCall()).toBe(300);
    });
  });

  test("invalid env falls back to default (no crash, no zero cap)", () => {
    withEnv("INTERFERENCE_MAX_STEPS", "-5", () => {
      expect(maxStepsPerCall()).toBe(100);
    });
    withEnv("INTERFERENCE_MAX_STEPS", "abc", () => {
      expect(maxStepsPerCall()).toBe(100);
    });
  });
});
