import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

const GLOBAL_CONFIG = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".config",
  "interference",
);

const GLOBAL_AGENTS = path.join(GLOBAL_CONFIG, "AGENTS.md");
const GLOBAL_CLAUDE = path.join(
  process.env.HOME ?? "/tmp",
  ".claude",
  "CLAUDE.md",
);

const PROJECT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export interface InstructionBlock {
  source: string;
  content: string;
}

export async function loadInstructions(): Promise<InstructionBlock[]> {
  const blocks: InstructionBlock[] = [];

  // 1. Global AGENTS.md
  try {
    const content = await readFile(GLOBAL_AGENTS, "utf-8");
    blocks.push({ source: GLOBAL_AGENTS, content });
  } catch {}

  // 2. ~/.claude/CLAUDE.md
  try {
    const content = await readFile(GLOBAL_CLAUDE, "utf-8");
    blocks.push({ source: GLOBAL_CLAUDE, content });
  } catch {}

  // 3. Project instructions — walk up from cwd, first match wins per file
  let dir = process.cwd();
  const root = path.parse(dir).root;
  const found = new Set<string>();

  while (dir !== root) {
    for (const name of PROJECT_FILES) {
      if (found.has(name)) continue;
      const fp = path.join(dir, name);
      try {
        const content = await readFile(fp, "utf-8");
        blocks.push({ source: fp, content });
        found.add(name);
      } catch {}
    }
    if (found.size >= PROJECT_FILES.length) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return blocks;
}

export function findProjectInstructionPath(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    for (const name of PROJECT_FILES) {
      const fp = path.join(dir, name);
      if (existsSync(fp)) return fp;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function loadInstructionContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function formatInstructionBlock(block: InstructionBlock): string {
  const short = block.source.startsWith(process.env.HOME ?? "/")
    ? block.source.replace(process.env.HOME ?? "/tmp", "~")
    : block.source;
  const trimmed = block.content.length > 4000
    ? block.content.slice(0, 4000) + "\n… [truncated]"
    : block.content;
  return `--- Instructions from: ${short} ---\n${trimmed}`;
}
