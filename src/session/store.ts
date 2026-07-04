import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import type { Todo } from "../tools/todowrite.ts";
import { interferenceDir } from "../paths.ts";

export interface SessionMeta {
  id: string;
  title?: string; // human-readable name (auto from first message or via /rename)
  workspace: string;
  startedAt: string;
  updatedAt: string;
  turnCount: number;
  mode: string;
  provider: string;
  model: string;
}

export interface Session {
  meta: SessionMeta;
  messages: ModelMessage[];
  todos?: Todo[];
  // Cumulative token usage (fix/11): persisted so cost survives a reload. Shape matches
  // cost.ts RawUsage (inlined to keep the store decoupled from cost).
  usage?: { noCacheInput: number; output: number; cacheRead: number; cacheWrite: number };
}

function projectDir(): string {
  const hash = createHash("sha256")
    .update(process.cwd())
    .digest("hex")
    .slice(0, 12);
  // Home redirectable via INTERFERENCE_HOME (test isolation) — see paths.ts.
  return interferenceDir(hash);
}

function sessionsDir(): string {
  return path.join(projectDir(), "sessions");
}

export function snapshotsDir(sessionId: string): string {
  return path.join(projectDir(), "snapshots", sessionId);
}

export async function initStore(): Promise<void> {
  await mkdir(sessionsDir(), { recursive: true });
}

export async function saveSession(session: Session): Promise<void> {
  await initStore();
  session.meta.updatedAt = new Date().toISOString();
  const file = path.join(sessionsDir(), `${session.meta.id}.json`);
  await writeFile(file, JSON.stringify(session, null, 2));
}

export async function loadSession(id: string): Promise<Session | null> {
  const file = path.join(sessionsDir(), `${id}.json`);
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    const entries = await readdir(sessionsDir());
    const metas: SessionMeta[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const session = await loadSession(entry.replace(".json", ""));
      if (session) metas.push(session.meta);
    }
    return metas.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export async function latestSession(): Promise<Session | null> {
  const metas = await listSessions();
  if (metas.length === 0) return null;
  return loadSession(metas[0]!.id);
}

export async function deleteSession(id: string): Promise<void> {
  const file = path.join(sessionsDir(), `${id}.json`);
  try { await rm(file); } catch {}
  try { await rm(snapshotsDir(id), { recursive: true }); } catch {}
}

export async function cleanupSessions(keep: number = 10): Promise<void> {
  const metas = await listSessions();
  for (const meta of metas.slice(keep)) {
    await deleteSession(meta.id);
  }
}

export function createSession(metaOverrides?: Partial<SessionMeta>): Session {
  const id =
    metaOverrides?.id ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  return {
    meta: {
      id,
      workspace: process.cwd(),
      startedAt: metaOverrides?.startedAt ?? now,
      updatedAt: now,
      turnCount: 0,
      mode: metaOverrides?.mode ?? "plan",
      provider: metaOverrides?.provider ?? "unknown",
      model: metaOverrides?.model ?? "unknown",
    },
    messages: [],
  };
}
