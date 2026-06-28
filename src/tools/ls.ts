import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";

const MAX_ENTRIES = 200;
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", ".venv", "vendor"]);

export const ls = tool({
  description:
    "List files and directories in a given directory. " +
    "Use this to explore the project structure.",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe("Directory path relative to workspace root (default: workspace root)"),
  }),
  execute: async ({ path: dirPath = "." }) => {
    const abs = resolveInWorkspace(dirPath);
    const name = path.relative(process.cwd(), abs) || abs;

    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch {
      return `Error: directory not found: ${name}`;
    }

    if (entries.length === 0) {
      return `${name}/ (empty)`;
    }

    const rows: string[] = [];
    const sorted = entries.sort();
    let skipped = 0;

    for (const entry of sorted) {
      if (SKIP_DIRS.has(entry)) {
        skipped++;
        continue;
      }
      if (rows.length >= MAX_ENTRIES) break;

      try {
        const s = await stat(path.join(abs, entry));
        const suffix = s.isDirectory() ? "/" : "";
        const size = s.isFile() ? formatSize(s.size) : "-";
        rows.push(`${size.padStart(6, " ")}  ${entry}${suffix}`);
      } catch {
        rows.push(`     ?  ${entry}`);
      }
    }

    const more =
      rows.length < entries.length - skipped
        ? `\n… and ${entries.length - skipped - rows.length} more entries`
        : "";
    const skipNote = skipped > 0 ? ` (${skipped} hidden dirs skipped)` : "";

    return `${name}/${skipNote} (${entries.length - skipped} entries):\n${rows.join("\n")}${more}`;
  },
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
