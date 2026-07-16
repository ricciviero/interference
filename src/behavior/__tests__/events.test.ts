import { describe, expect, test } from "bun:test";
import { BehaviorEventRecorder, isValidationCommand, toolOutcome, toolSubject } from "../events.ts";

describe("behavior event recorder", () => {
  test("records contiguous redacted events and derives only successful evidence", async () => {
    const changes: number[] = [];
    const recorder = new BehaviorEventRecorder(
      "session",
      "request",
      1,
      [],
      (events) => { changes.push(events.length); },
      () => new Date("2026-07-16T12:00:00.000Z"),
    );
    await recorder.record({
      type: "validation.recorded",
      outcome: "failed",
      exitCode: 1,
      evidenceKind: "validation",
    });
    await recorder.record({
      type: "validation.recorded",
      outcome: "succeeded",
      exitCode: 0,
      evidenceKind: "validation",
    });
    expect(recorder.events().map((event) => event.sequence)).toEqual([1, 2]);
    expect(recorder.evidence().map((item) => item.id)).toEqual([
      "session:1:2:validation.recorded",
    ]);
    expect(changes).toEqual([1, 2]);
  });

  test("command subjects contain executable plus hash, never raw arguments", () => {
    const command = "bun test --token sk-private-value";
    const subject = toolSubject("bash", { command });
    expect(subject).toMatch(/^bun#[a-f0-9]{12}$/);
    expect(subject).not.toContain("sk-private-value");
    expect(isValidationCommand({ command })).toBe(true);
  });

  test("failed and refused outputs cannot be mistaken for success", () => {
    expect(toolOutcome("tests failed (exit code: 2)")).toEqual({ outcome: "failed", exitCode: 2 });
    expect(toolOutcome("Write refused by user")).toEqual({ outcome: "refused" });
    expect(toolOutcome("Command succeeded (no output).")).toEqual({ outcome: "succeeded", exitCode: 0 });
  });
});
