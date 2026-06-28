import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import * as path from "node:path";

const OUTPUT_CAP = 30_000;

export const read = tool({
  description:
    "Read a file from the workspace. Use offset and limit for large files. " +
    "Returns content with line numbers. Prefer this over bash for reading files.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file, relative to workspace root"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Line number to start reading from (0-indexed)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe("Maximum number of lines to read"),
  }),
  execute: async ({ path: filePath, offset, limit }) => {
    const abs = resolveInWorkspace(filePath);
    const name = path.relative(process.cwd(), abs) || abs;
    const f = Bun.file(abs);

    if (!(await f.exists())) {
      return `Error: file not found: ${name}`;
    }

    const raw = await f.text();
    const lines = raw.split("\n");
    const start = offset ?? 0;
    const end = limit ? start + limit : lines.length;
    const sliced = lines.slice(start, end);

    const numbered = sliced
      .map((line, i) => {
        const n = String(start + i + 1).padStart(4, " ");
        return `${n}: ${line}`;
      })
      .join("\n");

    const truncated = numbered.length > OUTPUT_CAP;
    const output = truncated
      ? numbered.slice(0, OUTPUT_CAP) + "\n… [truncated]"
      : numbered;

    const linesLabel =
      end >= lines.length ? `${lines.length} lines` : `${start + 1}-${end} of ${lines.length} lines`;
    const header = `${name} (${linesLabel})${truncated ? " [truncated]" : ""}`;

    return `${header}\n${output}`;
  },
});
