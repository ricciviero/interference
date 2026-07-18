import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TurnBudgetExceededError, type Chunk } from "../agent/loop.ts";
import {
  collectHeadlessChunks,
  HeadlessArgumentError,
  parseHeadlessArgs,
  runHeadless,
} from "../cli-headless.ts";
import { redactText, safeToolSubject } from "../headless/redact.ts";
import type { HeadlessOptions } from "../headless/types.ts";

const roots: string[] = [];
const previousHome = process.env.INTERFERENCE_HOME;

afterEach(async () => {
  if (previousHome === undefined) delete process.env.INTERFERENCE_HOME;
  else process.env.INTERFERENCE_HOME = previousHome;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function options(root: string, treatment: "legacy" | "authoritative" = "legacy"): HeadlessOptions {
  return {
    outputJson: path.join(root, "trajectory.json"),
    treatment,
    provider: "deepseek",
    model: "deepseek-v4-pro",
    thinking: "max",
    maxCostUsd: 0.25,
    maxOutputTokens: 16_000,
    timeoutMs: 5_000,
    runId: `test-${treatment}`,
    taskId: "fixture",
  };
}

async function* fakeTurn(): AsyncGenerator<Chunk> {
  yield { type: "reasoning", text: "private chain of thought sk-private-12345678" };
  yield {
    type: "tool-call",
    toolCallId: "call-1",
    toolName: "bash",
    input: { command: "printf 'secret source' > result.txt" },
  };
  yield {
    type: "tool-result",
    toolCallId: "call-1",
    toolName: "bash",
    output: "secret source\nExit code: 0",
    isError: false,
  };
  yield { type: "text", text: "Completed. api_key=sk-public-1234567890" };
}

describe("headless CLI contract", () => {
  test("parses the explicit treatment/model/budget contract", () => {
    const parsed = parseHeadlessArgs([
      "--headless",
      "--output-json", "out.json",
      "--treatment", "legacy",
      "--provider", "deepseek",
      "--model", "deepseek-v4-pro",
      "--thinking", "max",
      "--max-cost-usd", "0.25",
    ]);
    expect(parsed).toMatchObject({
      outputJson: "out.json",
      treatment: "legacy",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinking: "max",
      maxCostUsd: 0.25,
    });
  });

  test("rejects missing output and unsupported thinking", () => {
    expect(() => parseHeadlessArgs(["--headless"])).toThrow(HeadlessArgumentError);
    expect(() => parseHeadlessArgs([
      "--headless", "--output-json", "out.json", "--provider", "kimi", "--model", "kimi-k3", "--thinking", "off",
    ])).toThrow("Thinking level off is not supported");
  });

  test("discards reasoning and stores only redacted, correlated tool metadata", async () => {
    const collected = await collectHeadlessChunks(fakeTurn());
    expect(collected.finalAnswer).toBe("Completed. [REDACTED]");
    expect(collected.tools).toEqual([
      {
        sequence: 1,
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "bash",
        subject: expect.stringMatching(/^printf#[a-f0-9]{12}$/),
        kind: "other",
      },
      {
        sequence: 2,
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "bash",
        outcome: "succeeded",
        exitCode: 0,
      },
    ]);
    expect(JSON.stringify(collected)).not.toContain("private chain");
    expect(JSON.stringify(collected)).not.toContain("secret source");
  });

  test("writes an atomic trajectory for both treatments without a provider call", async () => {
    for (const treatment of ["legacy", "authoritative"] as const) {
      const root = await mkdtemp(path.join(os.tmpdir(), `interference-headless-${treatment}-`));
      roots.push(root);
      process.env.INTERFERENCE_HOME = path.join(root, "home");
      const trajectory = await runHeadless(options(root, treatment), "Create result.txt and validate it.", {
        turnRunner: fakeTurn as typeof import("../agent/loop.ts").runTurn,
      });
      expect(trajectory.outcome).toBe("completed");
      expect(trajectory.treatment).toBe(treatment);
      expect(trajectory.exitCode).toBe(0);
      expect(trajectory.workspace).toBe(".");
      expect(trajectory.skills).toEqual({ matched: [], agenticSelected: [] });
      const persisted = JSON.parse(await readFile(options(root, treatment).outputJson, "utf8"));
      expect(persisted).toEqual(trajectory);
      expect(JSON.stringify(persisted)).not.toContain("private chain");
      expect(JSON.stringify(persisted)).not.toContain("secret source");
      expect(JSON.stringify(persisted)).not.toContain("sk-public");
    }
  });

  test("stops at budget preflight before invoking the model", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "interference-headless-budget-"));
    roots.push(root);
    process.env.INTERFERENCE_HOME = path.join(root, "home");
    let called = false;
    const limited = { ...options(root), maxCostUsd: 0.000001 };
    const trajectory = await runHeadless(limited, "Do a small task.", {
      turnRunner: (async function* () { called = true; }) as typeof import("../agent/loop.ts").runTurn,
    });
    expect(called).toBe(false);
    expect(trajectory.outcome).toBe("budget-exceeded");
    expect(trajectory.exitCode).toBe(4);
  });

  test("maps an in-loop provider budget stop to the stable budget outcome", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "interference-headless-runtime-budget-"));
    roots.push(root);
    process.env.INTERFERENCE_HOME = path.join(root, "home");
    const trajectory = await runHeadless(options(root), "Do a small task.", {
      turnRunner: (async function* () {
        throw new TurnBudgetExceededError(0.25, 0.25);
      }) as typeof import("../agent/loop.ts").runTurn,
    });
    expect(trajectory.outcome).toBe("budget-exceeded");
    expect(trajectory.exitCode).toBe(4);
    expect(trajectory.error?.name).toBe("TurnBudgetExceededError");
  });

  test("executes the real AI SDK tool loop against a local provider", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "interference-headless-provider-"));
    roots.push(root);
    const fixture = path.join(import.meta.dir, "fixtures", "headless-provider-e2e.ts");
    const child = Bun.spawn(["bun", fixture], {
      cwd: root,
      env: { ...Bun.env, INTERFERENCE_HOME: path.join(root, "home") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, childStderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode, childStderr).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.result).toBe("headless works\n");
    expect(result.requestCount).toBe(2);
    expect(result.trajectory.outcome).toBe("completed");
    expect(result.trajectory.workspace).toBe(".");
    expect(result.trajectory.tools.map((event: { type: string; toolCallId: string }) =>
      `${event.type}:${event.toolCallId}`)).toEqual([
      "tool-call:call-write-1",
      "tool-result:call-write-1",
    ]);
    const persisted = await readFile(path.join(root, "trajectory.json"), "utf8");
    expect(persisted).not.toContain("private reasoning");
    expect(persisted).not.toContain("headless works\\n");
    expect(persisted).not.toContain("fixture-key");
  });
});

describe("headless redaction", () => {
  test("normalizes paths and secrets", () => {
    expect(redactText("Bearer token.value")).toBe("[REDACTED]");
    expect(safeToolSubject("write", { path: "../outside.txt", content: "private" })).toBe("outside-workspace");
  });
});
