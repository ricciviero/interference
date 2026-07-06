import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { formatTurnError, MsgBlock } from "../App.tsx";
import { MissingApiKeyError } from "../../provider.ts";
import { PROVIDERS } from "../../config.ts";

describe("formatTurnError", () => {
  test("wraps a generic error into a clear one-liner", () => {
    expect(formatTurnError(new Error("boom"))).toBe("⚠ Request failed: boom");
  });

  test("takes only the first line of a multi-line SDK error (no stack dump)", () => {
    const err = new Error("402 Payment Required\n  at foo (bar.ts:1)\n  at baz");
    expect(formatTurnError(err)).toBe("⚠ Request failed: 402 Payment Required");
  });

  test("passes a MissingApiKeyError through with its actionable text", () => {
    const msg = formatTurnError(new MissingApiKeyError(PROVIDERS.openrouter));
    expect(msg).toContain("OPENROUTER_API_KEY");
  });

  test("handles a non-Error thrown value", () => {
    expect(formatTurnError("nope")).toBe("⚠ Request failed: nope");
  });
});

describe("MsgBlock error rendering", () => {
  test("an isError item renders its message visibly (was silently swallowed before)", () => {
    const { lastFrame, unmount } = render(
      <MsgBlock item={{ id: 1, role: "assistant", content: "⚠ Request failed: 402 no credit", isError: true }} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("⚠ Request failed: 402 no credit");
    unmount();
  });
});
