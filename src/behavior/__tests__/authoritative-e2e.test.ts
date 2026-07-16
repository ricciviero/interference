import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("Agentic SWE authoritative E2E", () => {
  test("moves planning → execution → completion using only host-verifiable evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "interference-authoritative-e2e-"));
    directories.push(root);
    const runner = path.join(import.meta.dir, "fixtures", "authoritative-e2e.ts");
    const process = Bun.spawn(["bun", runner], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, INTERFERENCE_HOME: path.join(root, ".interference-home") },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout) as {
      phases: string[];
      evidence: string[];
      events: unknown[];
      canComplete: boolean;
    };
    expect(result.phases).toEqual(["planning", "execution", "verification", "completion"]);
    expect(result.evidence).toContain("planning");
    expect(result.evidence).toContain("implementation");
    expect(result.evidence).toContain("validation");
    expect(result.canComplete).toBe(true);
    expect(JSON.stringify(result.events)).not.toContain("sk-private-e2e");
  });

  test("moves an unconfigured repository through setup → planning → verified completion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "interference-onboarding-e2e-"));
    directories.push(root);
    const runner = path.join(import.meta.dir, "fixtures", "unconfigured-e2e.ts");
    const process = Bun.spawn(["bun", runner], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, INTERFERENCE_HOME: path.join(root, ".interference-home") },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout) as {
      phases: string[];
      evidence: string[];
      events: unknown[];
      canComplete: boolean;
    };
    expect(result.phases).toEqual(["setup", "planning", "execution", "verification", "completion"]);
    expect(result.evidence).toEqual(expect.arrayContaining([
      "setup",
      "planning",
      "implementation",
      "validation",
    ]));
    expect(result.canComplete).toBe(true);
    expect(JSON.stringify(result.events)).not.toContain("content");
  });
});
