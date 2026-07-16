import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "../paths.ts";
import type { BehaviorSessionSnapshot, ShadowRecord, ShadowReport } from "./types.ts";

const writeQueues = new Map<string, Promise<void>>();

export function hashBehaviorValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function behaviorWorkspaceHash(workspace = process.cwd()): string {
  return hashBehaviorValue(path.resolve(workspace)).slice(0, 12);
}

export function behaviorDiagnosticsFile(
  sessionId: string,
  workspace = process.cwd(),
): string {
  return interferenceDir("behavior", behaviorWorkspaceHash(workspace), `${sessionId}.jsonl`);
}

/** Serialize each JSONL append in-process so concurrent shadow calls cannot interleave. */
export async function appendShadowRecord(
  record: ShadowRecord,
  workspace = process.cwd(),
): Promise<void> {
  const file = behaviorDiagnosticsFile(record.sessionId, workspace);
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    });
  writeQueues.set(file, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  }
}

export async function readShadowRecords(
  sessionId: string,
  workspace = process.cwd(),
): Promise<ShadowRecord[]> {
  const file = behaviorDiagnosticsFile(sessionId, workspace);
  try {
    const raw = await readFile(file, "utf8");
    const records: ShadowRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line) as ShadowRecord;
        if (value.schemaVersion === 1 && value.sessionId === sessionId) records.push(value);
      } catch {
        // A truncated final line must not make all prior diagnostics unreadable.
      }
    }
    return records;
  } catch {
    return [];
  }
}

export async function deleteShadowDiagnostics(
  sessionId: string,
  workspace = process.cwd(),
): Promise<void> {
  const file = behaviorDiagnosticsFile(sessionId, workspace);
  await writeQueues.get(file)?.catch(() => {});
  try {
    await rm(file);
  } catch {}
}

export function summarizeShadowRecords(records: readonly ShadowRecord[]): ShadowReport {
  const evaluated = records.filter((record) => record.status === "evaluated");
  const report: ShadowReport = {
    records: records.length,
    evaluated: evaluated.length,
    failed: records.length - evaluated.length,
    divergent: evaluated.filter((record) => record.comparison && !record.comparison.matches).length,
    classifierCostUsd: records.reduce(
      (sum, record) => sum + (record.classifier?.estimatedCostUsd ?? 0),
      0,
    ),
    classifierInputTokens: records.reduce(
      (sum, record) => sum + (record.classifier?.inputTokens ?? 0),
      0,
    ),
    classifierOutputTokens: records.reduce(
      (sum, record) => sum + (record.classifier?.outputTokens ?? 0),
      0,
    ),
  };
  const last = records.at(-1);
  if (last) report.last = last;
  return report;
}

export async function formatShadowReport(
  sessionId: string,
  workspace = process.cwd(),
): Promise<string> {
  const report = summarizeShadowRecords(await readShadowRecords(sessionId, workspace));
  return formatShadowSummary(report);
}

export function formatShadowSummary(report: ShadowReport): string {
  if (report.records === 0) return "No Agentic SWE shadow diagnostics for this session.";
  const lines = [
    `Agentic SWE shadow · ${report.evaluated}/${report.records} evaluated · ${report.divergent} divergent · ${report.failed} failed`,
    `Classifier: ${report.classifierInputTokens} input + ${report.classifierOutputTokens} output tokens · $${report.classifierCostUsd.toFixed(6)}`,
  ];
  if (report.last?.plan) {
    lines.push(
      `Last: ${report.last.plan.effectiveClassification} → ${report.last.plan.phase} · ` +
        `${report.last.comparison?.divergences.length ?? 0} divergences · request ${report.last.requestHash.slice(0, 12)}`,
    );
  } else if (report.last) {
    lines.push(`Last: failed · request ${report.last.requestHash.slice(0, 12)}`);
  }
  return lines.join("\n");
}

export function formatBehaviorSnapshot(snapshot: BehaviorSessionSnapshot): string {
  const plan = snapshot.plan;
  const lines = [
    `Agentic SWE ${snapshot.protocolVersion} · package ${snapshot.packageVersion} · authoritative`,
    `Phase: ${snapshot.phase}${plan ? ` · ${plan.effectiveClassification}` : ""} · request ${snapshot.requestId}`,
  ];
  if (plan) {
    lines.push(
      `Gates: ${plan.requiredGates.map((gate) => `${gate.id}=${gate.status}`).join(", ")}`,
      `Skills: ${plan.selectedSkills.map((skill) => skill.name).join(", ") || "none"}`,
    );
  }
  lines.push(
    `Outstanding: ${snapshot.outstandingCriteria?.join(", ") || "none"}`,
    `Evidence: ${snapshot.evidence?.length ?? 0} · events: ${snapshot.events?.length ?? 0}`,
  );
  const recent = snapshot.events?.slice(-5) ?? [];
  if (recent.length > 0) {
    lines.push("Recent:");
    for (const event of recent) {
      lines.push(`- ${event.type} · ${event.outcome}${event.subject ? ` · ${event.subject}` : ""}`);
    }
  }
  return lines.join("\n");
}
