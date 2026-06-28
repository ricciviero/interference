import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";
import { decide, requestConfirmation } from "../permissions.ts";
import * as path from "node:path";

export const edit = tool({
  description:
    "Replace a string in a file with another string. " +
    "The oldString must match EXACTLY ONCE in the file. " +
    "If it matches zero or multiple times, the edit fails. " +
    "Use `replaceAll: true` to replace all occurrences. " +
    "Prefer this over `write` for targeted changes to existing files.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file, relative to workspace root"),
    oldString: z.string().describe("The exact string to replace"),
    newString: z.string().describe("The string to replace it with"),
    replaceAll: z
      .boolean()
      .optional()
      .describe("If true, replace all occurrences instead of just one (default: false)"),
  }),
  execute: async ({ path: filePath, oldString, newString, replaceAll }) => {
    const abs = resolveInWorkspace(filePath);
    const rel = path.relative(process.cwd(), abs) || abs;

    const decision = decide("edit", filePath);
    if (decision === "deny") {
      return `Error: edit denied by policy for '${rel}'`;
    }

    const f = Bun.file(abs);
    if (!(await f.exists())) {
      return `Error: file not found: ${rel}`;
    }

    const content = await f.text();
    const count = countOccurrences(content, oldString);

    if (oldString === newString) {
      return `Error: oldString and newString are identical`;
    }

    if (count === 0) {
      return `Error: oldString not found in ${rel}. Ensure the string matches exactly (including whitespace).`;
    }

    if (!replaceAll && count > 1) {
      return (
        `Error: oldString matches ${count} times in ${rel}. Use 'replaceAll: true' to replace all, ` +
        `or provide more surrounding context to narrow to a single match.`
      );
    }

    if (decision === "ask") {
      const preview = generateEditPreview(rel, oldString, newString, replaceAll ?? false, count);
      const allowed = await requestConfirmation("edit", preview);
      if (!allowed) {
        return `Edit refused by user for '${rel}'`;
      }
    }

    const replaced = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);

    await Bun.write(abs, replaced);

    const label = replaceAll ? ` (${count} occurrences)` : "";
    return `Edited ${rel}${label}`;
  },
});

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function generateEditPreview(
  file: string,
  oldS: string,
  newS: string,
  replaceAll: boolean,
  count: number,
): string {
  const label = replaceAll ? `replace all (${count} occurrences)` : "replace once";
  const truncatedOld = oldS.length > 300 ? oldS.slice(0, 300) + "…" : oldS;
  const truncatedNew = newS.length > 300 ? newS.slice(0, 300) + "…" : newS;
  return `[edit] ${label}: ${file}\n- ${truncatedOld}\n+ ${truncatedNew}`;
}
