import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveBehaviorConfig } from "../../config-file.ts";

describe("behavior config", () => {
  test("defaults to Agentic SWE authoritative mode", () => {
    expect(resolveBehaviorConfig(undefined)).toEqual({
      engine: "agentic-swe",
      enforcement: "authoritative",
      diagnostics: true,
    });
  });

  test("keeps an explicit legacy rollback escape hatch", () => {
    expect(resolveBehaviorConfig({ engine: "legacy" })).toEqual({
      engine: "legacy",
      enforcement: "legacy",
      diagnostics: false,
    });
  });

  test("enables diagnostics by default for Agentic SWE enforcement", () => {
    expect(
      resolveBehaviorConfig({ engine: "agentic-swe", enforcement: "shadow" }),
    ).toEqual({
      engine: "agentic-swe",
      enforcement: "shadow",
      diagnostics: true,
    });
    expect(
      resolveBehaviorConfig({ engine: "agentic-swe", enforcement: "authoritative" }),
    ).toEqual({
      engine: "agentic-swe",
      enforcement: "authoritative",
      diagnostics: true,
    });
  });

  test("rejects shadow enforcement with the legacy engine", () => {
    expect(() =>
      resolveBehaviorConfig({ engine: "legacy", enforcement: "shadow" }),
    ).toThrow('requires behavior.engine "agentic-swe"');
  });

  test("rejects authoritative enforcement with the legacy engine", () => {
    expect(() =>
      resolveBehaviorConfig({ engine: "legacy", enforcement: "authoritative" }),
    ).toThrow('requires behavior.engine "agentic-swe"');
  });

  test("fails closed when an existing interference.json is invalid", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "interference-invalid-config-"));
    const configModule = pathToFileURL(join(import.meta.dir, "../../config-file.ts")).href;
    try {
      await writeFile(
        join(cwd, "interference.json"),
        JSON.stringify({ behavior: { engine: "legacy", enforcement: "authoritative" } }),
      );
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `import { loadConfig } from ${JSON.stringify(configModule)}; await loadConfig();`,
        ],
        { cwd, stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid interference config");
      expect(stderr).toContain('requires behavior.engine "agentic-swe"');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
