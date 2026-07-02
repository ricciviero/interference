import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import App from "../App.tsx";
import type { Session } from "../../session/store.ts";
import { setMode } from "../../config.ts";

// Isolate any ~/.interference access (project rule): a test that renders App must not
// touch the real store/version cache.
process.env.INTERFERENCE_HOME = mkdtempSync(path.join(tmpdir(), "interference-kb-"));

// Integration tests for the direct keyboard shortcuts (fix/08 Percorso A). They render
// the real App and drive it through stdin, asserting on the rendered frame.

function mkSession(): Session {
  return {
    meta: {
      id: "kbtest",
      workspace: process.cwd(),
      startedAt: "",
      updatedAt: "",
      turnCount: 0,
      mode: "build",
      provider: "DeepSeek",
      model: "deepseek-v4-pro",
    },
    messages: [],
    todos: [{ id: "1", content: "sample todo item", status: "pending" } as any],
  };
}

const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  process.env.INTERFERENCE_NO_UPDATE_CHECK = "1";
  setMode("build");
});

describe("fix/08 A3 — Shift+Tab cycles Plan/Build", () => {
  test("toggles Build → Plan → Build", async () => {
    const { lastFrame, stdin, unmount } = render(<App session={mkSession()} />);
    await settle();
    expect(/build/i.test(lastFrame() ?? "")).toBe(true);

    stdin.write("\x1b[Z"); // Shift+Tab
    await settle();
    expect(/plan/i.test(lastFrame() ?? "")).toBe(true);

    stdin.write("\x1b[Z");
    await settle();
    expect(/build/i.test(lastFrame() ?? "")).toBe(true);

    unmount();
  });
});

describe("fix/08 A2 — Ctrl+T toggles the todo list", () => {
  test("hides then shows the todo list", async () => {
    const { lastFrame, stdin, unmount } = render(<App session={mkSession()} />);
    await settle();
    expect((lastFrame() ?? "").includes("sample todo item")).toBe(true);

    stdin.write("\x14"); // Ctrl+T
    await settle();
    expect((lastFrame() ?? "").includes("sample todo item")).toBe(false);

    stdin.write("\x14");
    await settle();
    expect((lastFrame() ?? "").includes("sample todo item")).toBe(true);

    unmount();
  });
});

describe("fix/08 A6 — Ctrl+R opens reverse search (only with history)", () => {
  test("Ctrl+R with empty history does nothing; Esc-less no-op stays on input", async () => {
    const { lastFrame, stdin, unmount } = render(<App session={mkSession()} />);
    await settle();
    // No prompt history yet → Ctrl+R must NOT open the search overlay.
    stdin.write("\x12"); // Ctrl+R
    await settle();
    expect((lastFrame() ?? "").includes("reverse-i-search")).toBe(false);
    unmount();
  });
});
