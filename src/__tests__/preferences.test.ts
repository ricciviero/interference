import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Point interference home to a temp dir so the test doesn't touch the user's real
// ~/.interference/preferences.json. Must be set BEFORE any call to interferenceDir().
const tmpHome = mkdtempSync(join(tmpdir(), "interference-prefs-"));
process.env.INTERFERENCE_HOME = tmpHome;
mkdirSync(join(tmpHome, ".interference"), { recursive: true });

import {
  setProvider,
  setModel,
  resetModel,
  loadPreferences,
  savePreferences,
  currentProviderId,
  currentModel,
} from "../config.ts";

const prefsFile = join(tmpHome, ".interference", "preferences.json");

describe("preferences persistence", () => {
  beforeEach(() => {
    resetModel();
    setProvider("deepseek");
  });

  afterEach(() => {
    try { rmSync(prefsFile, { force: true }); } catch { /* ok */ }
  });

  afterAll(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  test("savePreferences writes the current provider and model", async () => {
    setProvider("anthropic");
    setModel("claude-sonnet-5");
    await savePreferences();

    const raw = await Bun.file(prefsFile).text();
    const prefs = JSON.parse(raw);
    expect(prefs.provider).toBe("anthropic");
    expect(prefs.model).toBe("claude-sonnet-5");
  });

  test("savePreferences omits fields that are not overridden", async () => {
    resetModel();
    setProvider("openai");
    await savePreferences();

    const raw = await Bun.file(prefsFile).text();
    const prefs = JSON.parse(raw);
    expect(prefs.provider).toBe("openai");
    expect(prefs.model).toBeUndefined();
  });

  test("loadPreferences restores both provider and model", async () => {
    setProvider("anthropic");
    setModel("claude-sonnet-5");
    await savePreferences();

    // Simulate fresh start: set everything to a different value.
    setProvider("deepseek");
    resetModel();
    expect(currentProviderId()).toBe("deepseek");
    expect(currentModel()).toBe("deepseek-v4-pro");

    await loadPreferences();
    expect(currentProviderId()).toBe("anthropic");
    expect(currentModel()).toBe("claude-sonnet-5");
  });

  test("loadPreferences is a no-op when the file doesn't exist (first run)", async () => {
    setProvider("anthropic");
    setModel("claude-sonnet-5");
    // File intentionally absent — simulate first run.

    await loadPreferences();
    expect(currentProviderId()).toBe("anthropic"); // unchanged
    expect(currentModel()).toBe("claude-sonnet-5"); // unchanged
  });

  test("loadPreferences silently ignores an unknown provider", async () => {
    writeFileSync(prefsFile, JSON.stringify({ provider: "nonexistent", model: "foo" }));
    setProvider("deepseek");
    setModel("deepseek-v4-flash");

    await loadPreferences();
    expect(currentProviderId()).toBe("deepseek"); // unknown provider ignored
    expect(currentModel()).toBe("foo"); // model still restored (harmless)
  });

  test("loadPreferences silently ignores corrupted JSON", async () => {
    writeFileSync(prefsFile, "not json {{{");
    setProvider("anthropic");
    setModel("claude-opus-4-8");

    await loadPreferences();
    expect(currentProviderId()).toBe("anthropic"); // unchanged
    expect(currentModel()).toBe("claude-opus-4-8"); // unchanged
  });

  test("full cycle: user selects a model, closes, reopens — preference survives", async () => {
    // User action: pick anthropic + claude-sonnet-5 (ModelPicker path).
    setProvider("anthropic");
    setModel("claude-sonnet-5");
    await savePreferences();

    // Process restart: in-memory overrides are gone, only the file remains.
    setProvider("deepseek");
    resetModel();
    expect(currentProviderId()).toBe("deepseek");
    expect(currentModel()).toBe("deepseek-v4-pro");

    // Startup: loadPreferences() is called in cli.ts.
    await loadPreferences();
    expect(currentProviderId()).toBe("anthropic");
    expect(currentModel()).toBe("claude-sonnet-5");
  });
});
