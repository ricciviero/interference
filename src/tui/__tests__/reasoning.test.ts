import { describe, test, expect } from "bun:test";
import { reasoningSummary } from "../reasoning.ts";

describe("reasoningSummary (iter 23)", () => {
  test("short first sentence", () => {
    expect(reasoningSummary("I need to check the files. Then I'll answer.")).toBe("I need to check the files.");
  });

  test("strip leading markdown and cap at 60", () => {
    const long = "## " + "x".repeat(80);
    const out = reasoningSummary(long);
    expect(out.startsWith("x")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61); // 60 + …
    expect(out.endsWith("…")).toBe(true);
  });

  test("skip blank lines, take the first meaningful one", () => {
    expect(reasoningSummary("\n\n- Analyzing the loop")).toBe("Analyzing the loop");
  });

  test("empty text → empty string", () => {
    expect(reasoningSummary("   \n  ")).toBe("");
  });
});
