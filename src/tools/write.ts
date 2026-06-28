import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import { decide, requestConfirmation } from "../permissions.ts";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";

const OUTPUT_CAP = 10_000;

export const write = tool({
  description:
    "Create or overwrite a file in the workspace. " +
    "Use this to create new files from scratch. " +
    "Prefer `edit` for small targeted changes to existing files.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file, relative to workspace root"),
    content: z.string().describe("The full content to write to the file"),
  }),
  execute: async ({ path: filePath, content }) => {
    const abs = resolveInWorkspace(filePath);
    const rel = path.relative(process.cwd(), abs) || abs;

    const decision = decide("write", filePath);
    if (decision === "deny") {
      return `Error: write denied by policy for '${rel}'`;
    }
    if (decision === "ask") {
      const preview = generateWritePreview(abs, content);
      const allowed = await requestConfirmation("write", preview);
      if (!allowed) {
        return `Write refused by user for '${rel}'`;
      }
    }

    await mkdir(path.dirname(abs), { recursive: true });
    await Bun.write(abs, content);

    const truncated = content.length > OUTPUT_CAP ? " [content truncated]" : "";
    return `Wrote ${rel} (${content.length} chars)${truncated}`;
  },
});

function generateWritePreview(abs: string, content: string): string {
  const name = path.relative(process.cwd(), abs) || abs;
  const preview = content.length > 500 ? content.slice(0, 500) + "\n… [truncated preview]" : content;
  const exists = Bun.file(abs);
  const action = exists.size > 0 ? "Overwrite" : "Create";
  return `[write] ${action}: ${name}\n---\n${preview}\n---`;
}
