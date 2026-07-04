import { describe, test, expect } from "bun:test";
import { nextLoopAction } from "../loop.ts";
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
