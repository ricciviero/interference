import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import * as path from "node:path";
import {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  latestSession,
  deleteSession,
  cleanupSessions,
  initStore,
} from "../store.ts";
import {
  initSnapshot,
  snapshotFile,
  undo,
  redo,
  nextTurn,
  canUndo,
  canRedo,
  cleanupSnapshots,
  finalizeSnapshots,
} from "../snapshot.ts";
import type { ModelMessage } from "ai";

const TMP = path.join(process.cwd(), ".test-tmp-session");

// STORE ISOLATION: redirects ~/.interference to TMP so that tests on
// saveSession/cleanupSessions/deleteSession NEVER touch the user's real sessions.
// Without this override, `cleanupSessions(2)` would delete the real chat files
// saved at ~/.interference/<hash>/sessions.
const PREV_HOME = process.env.INTERFERENCE_HOME;

beforeAll(async () => {
  process.env.INTERFERENCE_HOME = TMP;
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await writeFile(path.join(TMP, "a.txt"), "original a\n");
  await writeFile(path.join(TMP, "b.txt"), "original b\n");
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  if (PREV_HOME === undefined) delete process.env.INTERFERENCE_HOME;
  else process.env.INTERFERENCE_HOME = PREV_HOME;
});

describe("session store", () => {
  test("create and save session", async () => {
    const session = createSession({ mode: "plan" });
    expect(session.meta.id).toBeTruthy();
    expect(session.messages).toEqual([]);

    session.messages.push({ role: "user", content: "hello" } as ModelMessage);
    await saveSession(session);

    const loaded = await loadSession(session.meta.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages.length).toBe(1);
    expect(loaded!.meta.mode).toBe("plan");

    await deleteSession(session.meta.id);
  });

  test("load nonexistent session returns null", async () => {
    const s = await loadSession("nonexistent-id");
    expect(s).toBeNull();
  });

  test("list sessions", async () => {
    const a = createSession();
    const b = createSession();
    a.messages.push({ role: "user", content: "a" } as ModelMessage);
    b.messages.push({ role: "user", content: "b" } as ModelMessage);
    await saveSession(a);
    await saveSession(b);

    const list = await listSessions();
    expect(list.length).toBeGreaterThanOrEqual(2);

    await deleteSession(a.meta.id);
    await deleteSession(b.meta.id);
  });

  test("latest session", async () => {
    const a = createSession();
    await saveSession(a);
    const latest = await latestSession();
    expect(latest).not.toBeNull();
    expect(latest!.meta.id).toBe(a.meta.id);
    await deleteSession(a.meta.id);
  });

  test("cleanup keeps N most recent", async () => {
    for (let i = 0; i < 5; i++) {
      const s = createSession();
      await saveSession(s);
      await Bun.sleep(10);
    }
    await cleanupSessions(2);
    const list = await listSessions();
    expect(list.length).toBeLessThanOrEqual(2);
    for (const m of list) await deleteSession(m.id);
  });
});

describe("snapshot undo/redo", () => {
  test("snapshot and undo single file", async () => {
    initSnapshot("test-s1");
    await snapshotFile(path.join(TMP, "a.txt"));
    nextTurn();

    await writeFile(path.join(TMP, "a.txt"), "modified\n");
    await finalizeSnapshots();
    let content = await Bun.file(path.join(TMP, "a.txt")).text();
    expect(content).toBe("modified\n");

    const restored = await undo();
    expect(restored).toContain(path.join(TMP, "a.txt"));
    content = await Bun.file(path.join(TMP, "a.txt")).text();
    expect(content).toBe("original a\n");
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    await cleanupSnapshots();
  });

  test("snapshot and redo", async () => {
    initSnapshot("test-s2");
    await writeFile(path.join(TMP, "b.txt"), "original b\n");

    await snapshotFile(path.join(TMP, "b.txt"));
    nextTurn();
    await writeFile(path.join(TMP, "b.txt"), "changed\n");
    await finalizeSnapshots();

    await undo();
    await redo();
    const content = await Bun.file(path.join(TMP, "b.txt")).text();
    expect(content).toBe("changed\n");
    expect(canRedo()).toBe(false);

    await cleanupSnapshots();
  });

  test("multiple snapshots in one turn", async () => {
    initSnapshot("test-s3");
    await writeFile(path.join(TMP, "a.txt"), "v1\n");
    await writeFile(path.join(TMP, "b.txt"), "v1\n");

    await snapshotFile(path.join(TMP, "a.txt"));
    await snapshotFile(path.join(TMP, "b.txt"));
    nextTurn();

    await writeFile(path.join(TMP, "a.txt"), "v2\n");
    await writeFile(path.join(TMP, "b.txt"), "v2\n");
    await finalizeSnapshots();

    const restored = await undo();
    expect(restored.length).toBe(2);

    expect(await Bun.file(path.join(TMP, "a.txt")).text()).toBe("v1\n");
    expect(await Bun.file(path.join(TMP, "b.txt")).text()).toBe("v1\n");

    await cleanupSnapshots();
  });

  test("undo with no snapshots returns empty", async () => {
    initSnapshot("test-s4");
    const restored = await undo();
    expect(restored).toEqual([]);
    expect(canUndo()).toBe(false);
    await cleanupSnapshots();
  });

  test("redo with no redo stack returns empty", async () => {
    initSnapshot("test-s5");
    const restored = await redo();
    expect(restored).toEqual([]);
    await cleanupSnapshots();
  });

  test("snapshot without initSession is no-op", async () => {
    initSnapshot("");
    await snapshotFile(path.join(TMP, "a.txt"));
    expect(canUndo()).toBe(false);
  });
});
