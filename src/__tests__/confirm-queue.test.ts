import { describe, test, expect, afterEach } from "bun:test";
import {
  requestConfirmation,
  needsConfirmation,
  answerConfirmation,
  setConfirmHandler,
} from "../permissions.ts";

afterEach(() => {
  setConfirmHandler(null);
  // Drain any leftover queued request so tests don't leak into each other.
  while (needsConfirmation()) answerConfirmation(false);
});

describe("fix/01 — parallel confirmations don't deadlock (module queue)", () => {
  test("two concurrent requestConfirmation both resolve, in arrival order", async () => {
    setConfirmHandler(null); // use the fallback queue (no UI handler)

    let aResolved: boolean | undefined;
    let bResolved: boolean | undefined;
    // Two mutating tools request "ask" in the SAME step (Promise.all in the AI SDK).
    const a = requestConfirmation("write", "A").then((v) => (aResolved = v));
    const b = requestConfirmation("write", "B").then((v) => (bResolved = v));

    // Head of queue is the FIRST request; the second did NOT overwrite it.
    expect(needsConfirmation()).toEqual({ tool: "write", preview: "A" });

    // Nothing resolved until answered.
    await Promise.resolve();
    expect(aResolved).toBeUndefined();
    expect(bResolved).toBeUndefined();

    // Answer A → A resolves (pre-fix it would have hung forever), queue advances to B.
    answerConfirmation(true);
    await a;
    expect(aResolved).toBe(true);
    expect(needsConfirmation()).toEqual({ tool: "write", preview: "B" });

    // Answer B → B resolves; queue empty.
    answerConfirmation(false);
    await b;
    expect(bResolved).toBe(false);
    expect(needsConfirmation()).toBeNull();
  });

  test("three in parallel resolve independently with the right values", async () => {
    setConfirmHandler(null);
    const results: boolean[] = [];
    const ps = [
      requestConfirmation("edit", "1").then((v) => results.push(v)),
      requestConfirmation("edit", "2").then((v) => results.push(v)),
      requestConfirmation("bash", "3").then((v) => results.push(v)),
    ];
    expect(needsConfirmation()).toEqual({ tool: "edit", preview: "1" });
    answerConfirmation(true); // 1
    answerConfirmation(false); // 2
    answerConfirmation(true); // 3
    await Promise.all(ps);
    expect(results).toEqual([true, false, true]);
    expect(needsConfirmation()).toBeNull();
  });

  test("single confirmation still works (no regression)", async () => {
    setConfirmHandler(null);
    const p = requestConfirmation("bash", "ls");
    expect(needsConfirmation()).toEqual({ tool: "bash", preview: "ls" });
    answerConfirmation(true);
    expect(await p).toBe(true);
    expect(needsConfirmation()).toBeNull();
  });

  test("a registered handler bypasses the queue (production path)", async () => {
    setConfirmHandler(async () => true);
    // With a handler, needsConfirmation stays null (the queue isn't used).
    const p = requestConfirmation("write", "x");
    expect(await p).toBe(true);
    expect(needsConfirmation()).toBeNull();
  });
});
