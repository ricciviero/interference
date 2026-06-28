import { loadInstructions, formatInstructionBlock, type InstructionBlock } from "../context.ts";
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";

let cachedInstructions: InstructionBlock[] | null = null;
let bundledSkills: string | null = null;

const SKILLS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".interference",
  "skills",
);

const BUNDLED_SKILLS: Record<string, string> = {
  "agents-setup": `---
name: agents-setup
description: Generate or update AGENTS.md for a project. Use when the user asks /init,
  "setup agent", "initialize AGENTS.md", "configure project for agents", or wants to
  bootstrap a project for AI coding agents.
---

# agents-setup — Project bootstrap for AI agents

Generate an AGENTS.md file (the cross-tool standard). This file is the source of truth for any AI agent working on this project.

## Structure of AGENTS.md

- §1 Overview: name, description, stack, references
- §2 Agent skills: trigger → skill mapping table
- §3 Project-specific skills: .agents/skills/<name>/SKILL.md
- §4 Decision log: .agents/decisions/ (on-demand only)
- §5 Project memory: .agents/memory/ (living facts)
- §6 Non-negotiable rules: align to requirements, propagate fixes, completeness pass, what NOT to do
- §7 State snapshot: 🟢 milestones
- §8 What NOT to do

## How to proceed

1. Explore the codebase with ls, glob, grep, read
2. Identify: languages, frameworks, build tools, test setup, conventions
3. Write AGENTS.md at the project root`,

  "iterations-planner": `---
name: iterations-planner
description: Organize a backlog of features/fixes into local iteration folders. Use when
  the user provides a client brief with multiple features, asks to "plan iterations",
  "/iterations", "organize backlog", or reports a bug with "/fix", "correggi", "regressione".
  Creates iterazioni/NN-name/ folders with task.md + plan.md.
---

# iterations-planner — Organize project backlog into iterations

Transform a client brief into a structured, trackable backlog — local to the developer, not committed.

## Output structure

iterazioni/NN-name/task.md + plan.md (gitignored)
fix/NN-problem/bug.md + fix.md (gitignored)

## task.md template

- Status (⚪/🟡/🟢), original verbatim brief, objective, atomic tasks, files, deps, DoD

## plan.md template

- Technical decisions table, concrete steps in order, files touched, validation

## Ordering

- Foundation first, high-impact features next, cosmetic last
- Bugs by severity`,

  "interference-tool": `---
name: interference-tool
description: Pattern for adding or modifying a tool in the interference agent. Use when
  creating a new tool (read, write, edit, bash, etc.) or modifying an existing one.
  Covers: zod schema, path containment, permission gates, output truncation, registry,
  system prompt update, tests.
---

# Adding a tool to interference

All tools live in src/tools/ and follow the same skeleton.

## Skeleton

- import { tool } from "ai"; import { z } from "zod";
- import { resolveInWorkspace } from "./_fs.ts"; (if touches filesystem)
- import { decide, requestConfirmation } from "../permissions.ts"; (if mutating)
- tool({ description, inputSchema: z.object({...}), execute: async (args) => {...} })

## Checklist

- [ ] Zod inputSchema with .describe() on every field
- [ ] resolveInWorkspace() on every file path
- [ ] Permission gate (decide + requestConfirmation) for mutating tools
- [ ] Output truncated (OUTPUT_CAP constant)
- [ ] Registered in tools/index.ts (readonlyTools / allTools)
- [ ] System prompt updated in prompt.ts
- [ ] Tests in tools/__tests__/`,
};

export async function bootstrapSkills(): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  for (const [name, content] of Object.entries(BUNDLED_SKILLS)) {
    const dir = path.join(SKILLS_DIR, name);
    try {
      await mkdir(dir, { recursive: true });
    } catch {}
    const fp = path.join(dir, "SKILL.md");
    try {
      const existing = await readFile(fp, "utf-8");
      if (existing.trim() === content.trim()) continue;
    } catch {}
    await writeFile(fp, content);
  }
}

async function loadSkills(): Promise<string> {
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    const list: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      try {
        const content = await readFile(skillFile, "utf-8");
        const parsed = parseSkillFrontmatter(content);
        if (parsed) {
          list.push(`- \`${parsed.name}\`: ${parsed.description}`);
        }
      } catch {}
    }
    return list.length > 0
      ? "Available skills (use /<name> or trigger by description):\n" + list.join("\n")
      : "";
  } catch {
    return "";
  }
}

interface SkillInfo {
  name: string;
  description: string;
}

function parseSkillFrontmatter(content: string): SkillInfo | null {
  const match = content.match(/^---\nname:\s*(.+)\ndescription:\s*([\s\S]*?)\n---/);
  if (!match) return null;
  return {
    name: (match[1] ?? "").trim(),
    description: (match[2] ?? "").replace(/\n\s*/g, " ").trim(),
  };
}

export async function initInstructions(): Promise<InstructionBlock[]> {
  cachedInstructions = await loadInstructions();
  bundledSkills = await loadSkills();
  return cachedInstructions;
}

export function getInstructions(): InstructionBlock[] {
  return cachedInstructions ?? [];
}

export function systemPrompt(mode: "plan" | "build", instructions?: InstructionBlock[]): string {
  const blocks = instructions ?? cachedInstructions ?? [];
  const instructionText = blocks.length > 0
    ? "\n<instructions>\n" + blocks.map(formatInstructionBlock).join("\n\n") + "\n</instructions>\n"
    : "";

  const skillsText = bundledSkills
    ? "\n<available_skills>\n" + bundledSkills + "\n</available_skills>\n"
    : "";

  const envSection = `Working directory: ${process.cwd()}
OS: ${process.platform}
Date: ${new Date().toISOString().split("T")[0]}`;

  const base = `You are interference, an AI coding agent running in the user's terminal.

<environment>
${envSection}
</environment>${instructionText}${skillsText}
You have access to these tools:
- read: read file contents with line numbers (use offset/limit for large files)
- ls: list files and directories
- glob: find files by pattern (e.g. "src/**/*.ts")
- grep: search file contents with regex`;

  if (mode === "build") {
    return (
      base +
      `
- write: create or overwrite a file
- edit: replace a string in a file. The oldString must match EXACTLY ONCE in the file.
       Use 'replaceAll: true' to replace all occurrences.
       Prefer edit over write for targeted changes. If oldString matches multiple
       times, add more surrounding context to make it unique.
- bash: execute a shell command. Use for git, tests, build, package management.
       NEVER use interactive commands (no -i flag, no vim/nano). Commands that
       may be destructive (rm, sudo, curl pipe, force push) are blocked.

Rules:
- Be concise and precise. Prefer short, direct answers; expand only when asked.
- Use edit for small changes, write only for new files or complete rewrites.
- Before using bash, explain what the command will do.
- After editing a file, the user may need to approve the change.
- When you are unsure, say so instead of guessing.
- Never use emojis in responses.
- Format code in fenced blocks with the right language tag.`
    );
  }

  return (
    base +
    `
You are running in Plan mode (read-only). You cannot modify files or execute commands.
- Be concise and precise. Prefer short, direct answers; expand only when asked.
- When exploring the codebase: use ls/glob to map structure, grep to find code, read to inspect.
- Answer with specific file:line references.
- When you are unsure, say so instead of guessing.
- Never use emojis in responses.
- Format code in fenced blocks with the right language tag.`
  );
}
