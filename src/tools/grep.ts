import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import * as path from "node:path";
import { readdir, readFile } from "node:fs/promises";

const OUTPUT_CAP = 30_000;
const MAX_MATCHES = 500;

export const grep = tool({
  description:
    "Search for a regex pattern in file contents. " +
    "Returns matching lines with file path and line number. " +
    "Use this to find where functions, types, or strings are defined.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z
      .string()
      .optional()
      .describe("File or directory to search in, relative to workspace root (default: workspace root)"),
    include: z
      .string()
      .optional()
      .describe("Glob pattern to filter files (e.g. '*.ts', 'src/**')"),
    ignoreCase: z
      .boolean()
      .optional()
      .describe("Case-insensitive search (default: false)"),
  }),
  execute: async ({ pattern, path: searchPath, include, ignoreCase }) => {
    const cwd = searchPath ? resolveInWorkspace(searchPath) : process.cwd();
    const cwdName = path.relative(process.cwd(), cwd) || ".";

    const rgResult = await tryRg(pattern, cwd, include, ignoreCase);
    if (rgResult !== null) return rgResult;

    try {
      return await jsGrep(pattern, cwd, cwdName, include, ignoreCase);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `grep error: ${msg}`;
    }
  },
});

async function tryRg(
  pattern: string,
  cwd: string,
  include?: string,
  ignoreCase?: boolean,
): Promise<string | null> {
  const args = ["--line-number", "--no-heading", "--color=never", "--no-messages"];

  if (ignoreCase) args.push("--ignore-case");

  if (include) args.push("--glob", include);

  args.push("--", pattern);
  args.push(cwd);

  // ripgrep may not be installed: `Bun.spawn(["rg"])` throws ENOENT before
  // we can even read stderr → wrap everything and return null (→ JS fallback).
  try {
    const proc = Bun.spawn(["rg", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await proc.stdout.text();
    const err = await proc.stderr.text();
    await proc.exited;

    if (proc.exitCode === 0) {
      const cwdName = path.relative(process.cwd(), cwd) || ".";
      return formatMatches(out, pattern, cwdName);
    }

    if (proc.exitCode === 1) {
      const cwdName = path.relative(process.cwd(), cwd) || ".";
      return `No matches for '${pattern}' in ${cwdName}`;
    }

    if (err.includes("command not found") || err.includes("No such file")) {
      return null; // rg not available → JS fallback
    }

    return `grep error (exit ${proc.exitCode}): ${err || "unknown error"}`;
  } catch {
    return null; // rg not installed (ENOENT) → JS fallback
  }
}

async function jsGrep(
  pattern: string,
  absPath: string,
  name: string,
  include?: string,
  ignoreCase?: boolean,
): Promise<string> {
  const flags = ignoreCase ? "i" : "";
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    return `grep error: invalid regex pattern '${pattern}'`;
  }

  const matches: string[] = [];
  const fileEntries = include
    ? await collectMatching(absPath, include)
    : await collectAll(absPath);

  for (const filePath of fileEntries) {
    if (matches.length >= MAX_MATCHES) break;

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const rel = path.relative(process.cwd(), filePath) || filePath;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (regex.test(line)) {
          const stripped = line.trimEnd();
          const display =
            stripped.length > 200 ? stripped.slice(0, 200) + "…" : stripped;
          matches.push(`${rel}:${i + 1}: ${display}`);
          if (matches.length >= MAX_MATCHES) break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (matches.length === 0) {
    return `No matches for '${pattern}' in ${name}`;
  }

  let output = matches.join("\n");
  if (output.length > OUTPUT_CAP) {
    output = output.slice(0, OUTPUT_CAP) + "\n… [truncated]";
  }

  return `${matches.length} matches for '${pattern}' in ${name}:\n${output}`;
}

async function collectAll(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectAll(full);
        results.push(...nested);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  } catch {
    // Permission denied or similar
  }
  return results;
}

async function collectMatching(dir: string, globPattern: string): Promise<string[]> {
  const g = new Bun.Glob(globPattern);
  const results: string[] = [];
  for await (const match of g.scan({ cwd: dir, absolute: false, onlyFiles: true })) {
    results.push(path.join(dir, match));
  }
  return results;
}

function formatMatches(raw: string, pattern: string, cwdName: string): string {
  const lines = raw.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return `No matches for '${pattern}' in ${cwdName}`;
  }

  const truncated = lines.length > MAX_MATCHES;
  const shown = truncated ? lines.slice(0, MAX_MATCHES) : lines;
  let output = shown.join("\n");

  if (output.length > OUTPUT_CAP) {
    output = output.slice(0, OUTPUT_CAP) + "\n… [truncated]";
  }

  const note = truncated
    ? `\n… [${lines.length} matches, showing ${MAX_MATCHES}]`
    : "";
  return `${lines.length} matches for '${pattern}' in ${cwdName}:${note}\n${output}`;
}
