import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendShadowRecord,
  deleteShadowDiagnostics,
  formatBehaviorSnapshot,
  formatShadowReport,
  readShadowRecords,
} from "../diagnostics.ts";
import type { ShadowRecord } from "../types.ts";
import { PROTOCOL_VERSION } from "@agenticswe/core";

let home: string | undefined;

afterEach(async () => {
  delete process.env.INTERFERENCE_HOME;
  if (home) await rm(home, { recursive: true, force: true });
  home = undefined;
});

function record(): ShadowRecord {
  return {
    schemaVersion: 1,
    recordedAt: "2026-07-16T12:00:00.000Z",
    sessionId: "diagnostic-session",
    turnNumber: 1,
    requestId: "diagnostic-session:1:abc",
    workspaceHash: "workspace123",
    requestHash: "a".repeat(64),
    requestCharacters: 42,
    protocolVersion: PROTOCOL_VERSION,
    packageVersion: "0.1.0",
    status: "evaluated",
    legacy: {
      mode: "build",
      toolNames: ["read"],
      selectedSkills: [],
      capabilities: ["repository:read"],
    },
    plan: {
      phase: "execution",
      effectiveClassification: "non-trivial",
      gates: [],
      selectedSkills: [],
      requestedCapabilities: ["repository:read"],
      effectiveCapabilities: ["repository:read"],
      reasons: ["TASK_NON_TRIVIAL"],
    },
    comparison: { matches: true, divergences: [] },
    classifier: {
      requestId: "diagnostic-session:1:abc",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      durationMs: 10,
      inputTokens: 20,
      outputTokens: 5,
      estimatedCostUsd: 0.00001,
      summaryCharacters: 42,
      truncated: false,
      attempts: 1,
      outcome: "success",
    },
    diagnostics: [],
  };
}

describe("shadow diagnostics storage", () => {
  test("appends, summarizes, and deletes records with the session", async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "interference-home-"));
    process.env.INTERFERENCE_HOME = home;
    const workspace = path.join(home, "workspace");

    await appendShadowRecord(record(), workspace);
    expect(await readShadowRecords("diagnostic-session", workspace)).toHaveLength(1);
    expect(await formatShadowReport("diagnostic-session", workspace)).toContain(
      "1/1 evaluated",
    );

    await deleteShadowDiagnostics("diagnostic-session", workspace);
    expect(await readShadowRecords("diagnostic-session", workspace)).toEqual([]);
  });

  test("formats authoritative status from redacted state", () => {
    const output = formatBehaviorSnapshot({
      schemaVersion: 1,
      protocolVersion: PROTOCOL_VERSION,
      packageVersion: "0.1.0",
      requestId: "request-status",
      phase: "verification",
      turnNumber: 3,
      outstandingCriteria: ["validation-evidence"],
      evidence: [],
      events: [{
        schemaVersion: 1,
        protocolVersion: PROTOCOL_VERSION,
        id: "event-1",
        sessionId: "session",
        requestId: "request-status",
        turnNumber: 3,
        sequence: 1,
        type: "validation.recorded",
        outcome: "failed",
        occurredAt: "2026-07-16T12:00:00.000Z",
        subject: "bun#aabbccddeeff",
        exitCode: 1,
        evidenceKind: "validation",
      }],
    });
    expect(output).toContain("authoritative");
    expect(output).toContain("Phase: verification");
    expect(output).toContain("validation-evidence");
    expect(output).toContain("bun#aabbccddeeff");
  });
});
