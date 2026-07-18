import { describe, expect, test } from "bun:test";
import { normalizeModelClassification } from "../classifier.ts";

const criteria = {
  localized: true,
  mechanicallyClear: true,
  noBehaviorOrContractChange: true,
  noSequencingDecision: true,
};

describe("model behavior classification", () => {
  test("accepts trivial only when every normative criterion is satisfied", () => {
    const accepted = normalizeModelClassification({
      value: "trivial",
      reasons: ["mechanical edit"],
      confidence: 0.9,
      trivialCriteria: criteria,
      selectedSkills: [],
    });
    expect(accepted.value).toBe("trivial");

    const rejected = normalizeModelClassification({
      value: "trivial",
      reasons: ["localized"],
      confidence: 0.9,
      trivialCriteria: { ...criteria, noBehaviorOrContractChange: false },
      selectedSkills: [],
    });
    expect(rejected.value).toBe("non-trivial");
    expect(rejected.reasons.at(-1)).toContain("normative criteria");
  });

  test("keeps conservative model classifications unchanged", () => {
    const output = normalizeModelClassification({
      value: "non-trivial",
      reasons: ["multiple deliverables"],
      confidence: 0.8,
      trivialCriteria: criteria,
      selectedSkills: ["iterations-planner"],
    });
    expect(output.value).toBe("non-trivial");
    expect(output.selectedSkills).toEqual(["iterations-planner"]);
  });

  test("rejects trivial when the request has deterministic protocol signals", () => {
    const output = normalizeModelClassification({
      value: "trivial",
      reasons: ["localized"],
      confidence: 0.95,
      trivialCriteria: criteria,
      selectedSkills: [],
    }, "Add an export, add test coverage, and validate the complete suite.");
    expect(output.value).toBe("non-trivial");
    expect(output.reasons.at(-1)).toMatch(/behavior|contract|multiple/);
  });

  test("does not inflate a single mechanical edit", () => {
    const output = normalizeModelClassification({
      value: "trivial",
      reasons: ["one mechanical edit"],
      confidence: 0.95,
      trivialCriteria: criteria,
      selectedSkills: [],
    }, "Change color=blue to color=green in settings.txt.");
    expect(output.value).toBe("trivial");
  });
});
