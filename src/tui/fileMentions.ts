// @-file mentions. Typing `@` in the prompt opens a file picker; selecting inserts the path.
// The file content is NOT expanded: the path travels to the model as-is, which reads it with
// `read` if needed. The scanner + fuzzy ranking + token helpers are pure where possible (testable).

import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", ".cache", "out", ".turbo", "vendor",
]);
const MAX_FILES = 20000;

/** Best-effort .gitignore matcher: exact dir/file names, `/rooted` prefixes, and simple `*` globs.
 *  Not a full gitignore engine — good enough to hide the obvious noise (kept honest, documented). */
async function loadGitignore(root: string): Promise<(relPath: string) => boolean> {
  let lines: string[] = [];
  try {
    const raw = await readFile(path.join(root, ".gitignore"), "utf-8");
    lines = raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    /* no .gitignore → match nothing */
  }
  const patterns = lines.map((l) => l.replace(/^\//, "").replace(/\/$/, ""));
  return (relPath: string) => {
    const clean = relPath.replace(/\/$/, "");
    const base = clean.split("/").pop() ?? clean;
    return patterns.some((pat) => {
      if (pat.includes("*")) {
        const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
        return re.test(base) || re.test(clean);
      }
      return clean === pat || clean.startsWith(pat + "/") || base === pat;
    });
  };
}

/** Recursively list project files as workspace-relative paths, skipping heavy/VCS dirs and
 *  .gitignore'd entries. Capped at MAX_FILES; never throws (unreadable dirs are skipped). */
export async function scanProjectFiles(root: string): Promise<string[]> {
  const ignored = await loadGitignore(root);
  const out: string[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || ignored(relPath + "/")) continue;
        await walk(path.join(dir, e.name), relPath);
      } else if (e.isFile()) {
        if (ignored(relPath)) continue;
        out.push(relPath);
      }
    }
  }

  await walk(root, "");
  return out;
}

/** True if every char of `q` appears in `s` in order (fuzzy subsequence). */
export function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) i++;
  }
  return i === q.length;
}

function scoreMention(file: string, q: string): number {
  const base = file.split("/").pop() ?? file;
  if (file === q) return 1000;
  if (base === q) return 900;
  if (base.startsWith(q)) return 800;
  if (file.startsWith(q)) return 700;
  if (base.includes(q)) return 600;
  if (file.includes(q)) return 500;
  if (isSubsequence(q, file)) return 300;
  return 0;
}

/** Rank files against the query (exact › prefix-base › prefix-path › substring › subsequence);
 *  ties broken by shorter path. Empty query → the first `limit` files. */
export function rankFileMentions(files: string[], query: string, limit = 20): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, limit);
  const scored: { f: string; s: number }[] = [];
  for (const f of files) {
    const s = scoreMention(f.toLowerCase(), q);
    if (s > 0) scored.push({ f, s });
  }
  scored.sort((a, b) => b.s - a.s || a.f.length - b.f.length);
  return scored.slice(0, limit).map((x) => x.f);
}

/** The active `@…` token in the draft: the last `@` whose text has no space after it (still
 *  being typed). Returns the query (text after `@`) and the `@` index, or null if none active. */
export function getAtQuery(draft: string): { query: string; at: number } | null {
  const at = draft.lastIndexOf("@");
  if (at === -1) return null;
  const after = draft.slice(at + 1);
  if (/\s/.test(after)) return null; // token already completed (a space closed it)
  return { query: after, at };
}

/** Replace the active `@…` token with `@<path> ` (trailing space closes the mention). */
export function insertMention(draft: string, at: number, filePath: string): string {
  return draft.slice(0, at) + "@" + filePath + " ";
}
