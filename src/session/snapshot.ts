import { mkdir, copyFile, rm } from "node:fs/promises";
import * as path from "node:path";
import { snapshotsDir } from "./store.ts";

interface SnapshotEntry {
  turn: number;
  file: string;
  beforePath: string;
  afterPath: string;
}

interface UndoEntry {
  turn: number;
  entries: SnapshotEntry[];
}

let undoStack: UndoEntry[] = [];
let redoStack: UndoEntry[] = [];
let sessionId = "";
let turnCounter = 0;

export function initSnapshot(sid: string) {
  sessionId = sid;
  undoStack = [];
  redoStack = [];
  turnCounter = 0;
}

export function nextTurn() {
  turnCounter++;
}

export async function snapshotFile(filePath: string): Promise<void> {
  if (!sessionId) return;
  const dir = path.join(snapshotsDir(sessionId), String(turnCounter));
  await mkdir(dir, { recursive: true });

  const abs = path.resolve(process.cwd(), filePath);
  const base = path.basename(abs);
  const beforePath = path.join(dir, `before_${base}`);
  const afterPath = path.join(dir, `after_${base}`);

  try {
    await copyFile(abs, beforePath);
  } catch {
    return;
  }

  const entry: SnapshotEntry = { turn: turnCounter, file: filePath, beforePath, afterPath };

  if (undoStack.length > 0 && undoStack[undoStack.length - 1]!.turn === turnCounter) {
    undoStack[undoStack.length - 1]!.entries.push(entry);
  } else {
    undoStack.push({ turn: turnCounter, entries: [entry] });
  }

  if (undoStack.length > 50) undoStack.shift();
}

export async function finalizeSnapshots(): Promise<void> {
  if (!sessionId || undoStack.length === 0) return;
  const entry = undoStack[undoStack.length - 1]!;
  for (const e of entry.entries) {
    try {
      await copyFile(path.resolve(process.cwd(), e.file), e.afterPath);
    } catch {}
  }
}

export async function undo(): Promise<string[]> {
  if (undoStack.length === 0) return [];

  const entry = undoStack.pop()!;
  redoStack.push(entry);
  const restored: string[] = [];

  for (const e of entry.entries) {
    try {
      await copyFile(e.beforePath, path.resolve(process.cwd(), e.file));
      restored.push(e.file);
    } catch {}
  }

  turnCounter = Math.max(1, turnCounter - 1);
  return restored;
}

export async function redo(): Promise<string[]> {
  if (redoStack.length === 0) return [];

  const entry = redoStack.pop()!;
  undoStack.push(entry);
  const restored: string[] = [];

  for (const e of entry.entries) {
    try {
      await copyFile(e.afterPath, path.resolve(process.cwd(), e.file));
      restored.push(e.file);
    } catch {}
  }

  turnCounter++;
  return restored;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undoRedoState() {
  return { canUndo: canUndo(), canRedo: canRedo() };
}

export async function cleanupSnapshots(): Promise<void> {
  try {
    await rm(snapshotsDir(sessionId), { recursive: true, force: true });
  } catch {}
}
