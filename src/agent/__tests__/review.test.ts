import { describe, test, expect } from "bun:test";
import { runReview } from "../review.ts";

describe("runReview (iter 36)", () => {
  test("empty diff returns an informative message without calling the LLM", async () => {
    const result = await runReview("");
    expect(result).toBe("No changes to review.");
  });

  test("whitespace-only diff is treated as empty", async () => {
    const result = await runReview("   \n  \n");
    expect(result).toBe("No changes to review.");
  });
});
