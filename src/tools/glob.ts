import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import * as path from "node:path";

const MAX_RESULTS = 200;

export const glob = tool({
  description:
    "Find files matching a glob pattern (e.g. 'src/**/*.ts'). " +
    "Use this to locate files by name or extension.",
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern relative to workspace root"),
    cwd: z
      .string()
      .optional()
      .describe("Directory to search in, relative to workspace root (default: workspace root)"),
  }),
  execute: async ({ pattern: globPattern, cwd }) => {
    const base = cwd ? resolveInWorkspace(cwd) : process.cwd();
    const baseName = path.relative(process.cwd(), base) || ".";

    const g = new Bun.Glob(globPattern);
    const results: string[] = [];

    for await (const match of g.scan({ cwd: base, absolute: false, onlyFiles: true })) {
      const segs = match.split("/");
      if (segs.includes("node_modules") || segs.includes(".git")) continue;
      if (results.length >= MAX_RESULTS) break;
      results.push(match);
    }

    if (results.length === 0) {
      return `No files matched '${globPattern}' in ${baseName}`;
    }

    const truncated = results.length >= MAX_RESULTS ? `\n… [truncated to ${MAX_RESULTS} results]` : "";
    return `${results.length} files matching '${globPattern}' in ${baseName}:${truncated}\n${results.join("\n")}`;
  },
});
