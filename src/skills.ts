import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";
import { loadSkill } from "@agenticswe/skills";

/** Skills directory (`~/.interference/skills`, redirectable in tests). */
export function skillsDir(): string {
  return interferenceDir("skills");
}

const BUNDLED_SKILLS: Record<string, string> = {
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
  const frameworkSkills = await Promise.all(
    ["agents-setup", "iterations-planner"].map((name) => loadSkill(name)),
  );
  const sources: Record<string, string> = { ...BUNDLED_SKILLS };
  for (const skill of frameworkSkills) sources[skill.name] = skill.content;

  for (const [name, content] of Object.entries(sources)) {
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
