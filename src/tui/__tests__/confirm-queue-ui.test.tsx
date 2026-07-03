import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import App from "../App.tsx";
import type { Session } from "../../session/store.ts";
import { requestConfirmation, setConfirmHandler, needsConfirmation, answerConfirmation } from "../../permissions.ts";

process.env.INTERFERENCE_HOME = mkdtempSync(path.join(tmpdir(), "interference-cq-"));

function mkSession(): Session {
  return {
    meta: { id: "cq", workspace: process.cwd(), startedAt: "", updatedAt: "", turnCount: 0, mode: "build", provider: "DeepSeek", model: "deepseek-v4-pro" },
    messages: [],
    todos: [],
  };
}

const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  process.env.INTERFERENCE_NO_UPDATE_CHECK = "1";
  setConfirmHandler(null);
  while (needsConfirmation()) answerConfirmation(false);
});

describe("fix/01 — parallel confirmations in the real TUI (App queue)", () => {
  test("two write confirmations in one step: both dialogs shown in order, both resolve", async () => {
    const { lastFrame, stdin, unmount } = render(<App session={mkSession()} />);
    await settle(); // App mounts and registers the confirm handler

    // Two mutating tools ask for confirmation in the same step (Promise.all).
    let aResolved: boolean | undefined;
    let bResolved: boolean | undefined;
    const a = requestConfirmation("write", "fileA.ts").then((v) => (aResolved = v));
    const b = requestConfirmation("write", "fileB.ts").then((v) => (bResolved = v));
    await settle();

    // The FIRST request is shown, and the queue indicator reports the second waiting.
    let f = lastFrame() ?? "";
    expect(f).toContain("Allow write?");
    expect(f).toContain("fileA.ts");
    expect(f).toContain("more confirmation(s) waiting");
    expect(aResolved).toBeUndefined();
    expect(bResolved).toBeUndefined();

    // Answer the first (y) → A resolves, the second becomes the active dialog.
    stdin.write("y");
    await settle();
    await a;
    expect(aResolved).toBe(true);
    f = lastFrame() ?? "";
    expect(f).toContain("fileB.ts");
    expect(f).not.toContain("more confirmation(s) waiting"); // only one left now

    // Answer the second (n) → B resolves; no dialog remains.
    stdin.write("n");
    await settle();
    await b;
    expect(bResolved).toBe(false);
    expect(lastFrame() ?? "").not.toContain("Allow write?");

    unmount();
  });

  test("single confirmation still works end-to-end", async () => {
    const { lastFrame, stdin, unmount } = render(<App session={mkSession()} />);
    await settle();
    const p = requestConfirmation("bash", "rm build/");
    await settle();
    expect(lastFrame() ?? "").toContain("Allow bash?");
    stdin.write("y");
    await settle();
    expect(await p).toBe(true);
    unmount();
  });
});
