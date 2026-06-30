import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";

/** Directory delle skill (`~/.interference/skills`, reindirizzabile in test). */
export function skillsDir(): string {
  return interferenceDir("skills");
}

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
- §6 Non-negotiable rules: align to requirements, propagate fixes, completeness pass
- §7 State snapshot
- §8 What NOT to do`,

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

## task.md: status, verbatim brief, objective, atomic tasks, files, deps, DoD
## plan.md: decisions table, concrete steps, files touched, validation
## Ordering: foundation first, high-impact next, cosmetic last, bugs by severity`,

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
- import { resolveInWorkspace } from "./_fs.ts";
- import { decide, requestConfirmation } from "../permissions.ts";
- tool({ description, inputSchema: z.object({...}), execute: async (args) => {...} })

## Checklist
- Zod inputSchema with .describe() on every field
- resolveInWorkspace() on every file path
- Permission gate for mutating tools
- Output truncated (OUTPUT_CAP)
- Registered in tools/index.ts
- System prompt updated
- Tests in tools/__tests__/`,
};

export interface SkillInfo {
  name: string;
  description: string;
}

let registryCache: SkillInfo[] | null = null;

export async function loadSkillRegistry(): Promise<SkillInfo[]> {
  if (registryCache) return registryCache;
  const list: SkillInfo[] = [];
  try {
    const entries = await readdir(skillsDir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir(), entry.name, "SKILL.md");
      try {
        const content = await readFile(skillFile, "utf-8");
        const info = parseSkillFrontmatter(content);
        if (info) list.push(info);
      } catch {}
    }
  } catch {}
  registryCache = list;
  return list;
}

export function getCachedRegistry(): SkillInfo[] {
  return registryCache ?? [];
}

function parseSkillFrontmatter(content: string): SkillInfo | null {
  const match = content.match(/^---\nname:\s*(.+)\ndescription:\s*([\s\S]*?)\n---/);
  if (!match) return null;
  return {
    name: (match[1] ?? "").trim(),
    description: (match[2] ?? "").replace(/\n\s*/g, " ").trim(),
  };
}

export async function loadSkillBody(name: string): Promise<string | null> {
  const skillFile = path.join(skillsDir(), name, "SKILL.md");
  try {
    return await readFile(skillFile, "utf-8");
  } catch {
    return null;
  }
}

export function matchSkills(userMessage: string, skills: SkillInfo[], max = 3): string[] {
  const tokens = tokenize(userMessage);
  if (tokens.length === 0) return [];

  const scored = skills.map((s) => {
    const descTokens = tokenize(s.description);
    const matches = tokens.filter((t) => descTokens.includes(t));
    return {
      name: s.name,
      score: matches.length,
    };
  });

  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.name);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/_-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "the", "and", "for", "use", "when", "this", "that", "with", "from",
  "your", "have", "has", "are", "was", "will", "can", "not", "but",
  "all", "any", "its", "you", "how", "what", "where", "which", "who",
  "into", "just", "also", "very", "much", "some", "than", "then",
  "does", "more", "most", "such", "each", "over", "only", "per",
]);

export async function bootstrapSkills(): Promise<void> {
  for (const [name, content] of Object.entries(BUNDLED_SKILLS)) {
    const dir = path.join(skillsDir(), name);
    try { await mkdir(dir, { recursive: true }); } catch {}
    const fp = path.join(dir, "SKILL.md");
    try {
      const existing = await readFile(fp, "utf-8");
      if (existing.trim() === content.trim()) continue;
    } catch {}
    await writeFile(fp, content);
  }
}
