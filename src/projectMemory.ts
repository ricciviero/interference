// Project memory: living, per-topic facts the agent accumulates about a project and reloads
// every session, so it "remembers" what isn't derivable from the code (integration state,
// env quirks, decisions, gotchas). Lives in the project under `.agents/memory/` (versionable,
// but gitignored by default): a MEMORY.md index plus one `.md` file per fact.
//
// This module only READS the memory into the system prompt. Creation/maintenance is done by
// the agent itself (via write/edit), driven by the maintenance rules in the system prompt.

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";

const AGENTS_DIR = ".agents";
/** Total budget of memory text injected into the prompt (chars), to bound context growth. */
const MEMORY_BUDGET = 8000;

/** Walk up from `start` to the nearest ancestor containing a `.agents/` directory. */
export function findAgentsDir(start: string = process.cwd()): string | null {
  let dir = start;
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, AGENTS_DIR);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  return null;
}

/** The project's memory as one formatted string: the MEMORY.md index plus each topic memo,
 *  capped at MEMORY_BUDGET. Null when there is no `.agents/memory/`. */
export async function loadProjectMemory(start: string = process.cwd()): Promise<string | null> {
  const agentsDir = findAgentsDir(start);
  if (!agentsDir) return null;
  const memDir = path.join(agentsDir, "memory");

  let index = "";
  try {
    index = (await readFile(path.join(memDir, "MEMORY.md"), "utf-8")).trim();
  } catch {
    /* no index */
  }

  let files: string[] = [];
  try {
    files = (await readdir(memDir)).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").sort();
  } catch {
    return index || null; // no memo dir → just the index (if any)
  }

  const memos: string[] = [];
  let budget = MEMORY_BUDGET;
  for (let i = 0; i < files.length; i++) {
    if (budget <= 0) {
      memos.push(`… [${files.length - i} more memo(s) not shown — over budget]`);
      break;
    }
    try {
      const body = (await readFile(path.join(memDir, files[i]!), "utf-8")).trim();
      const slice = body.length > budget ? body.slice(0, budget) + " …" : body;
      memos.push(`### ${files[i]}\n${slice}`);
      budget -= slice.length;
    } catch {
      /* skip unreadable memo */
    }
  }

  const parts = [index, ...memos].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** The project-local skills directory (`.agents/skills/`), if present. */
export function projectSkillsDir(start: string = process.cwd()): string | null {
  const agentsDir = findAgentsDir(start);
  if (!agentsDir) return null;
  const dir = path.join(agentsDir, "skills");
  return existsSync(dir) ? dir : null;
}

// --- Setup / write side (F3/F4) --------------------------------------------

const MEMORY_INDEX_TEMPLATE = `# Project memory — index

One line per memory below. Each memory is a \`.md\` file in this folder holding one durable fact
about this project (integration/env state, a decision and why, a gotcha, a recurring pattern).
The agent loads this into its context every session.

<!-- - [title](file.md) — one-line hook -->
`;

const DECISIONS_README = `# Decision log (ADR)

Non-trivial architectural/technical decisions, recorded on-demand. One file per decision:
\`YYYY-MM-DD-slug.md\` with context, alternatives, consequences, and a status.
`;

const SKILLS_README = `# Project skills

Repeatable, project-specific patterns captured as skills. One \`.md\` per skill: a frontmatter
(name, description) plus the pattern with examples taken from the real code.
`;

async function writeIfAbsent(fp: string, content: string): Promise<void> {
  if (existsSync(fp)) return;
  await writeFile(fp, content);
}

/** Add `pattern` to the project's .gitignore if not already present (memory is not committed
 *  by default; the user opts in). */
async function ensureGitignored(root: string, pattern: string): Promise<void> {
  const gi = path.join(root, ".gitignore");
  let content = "";
  try {
    content = await readFile(gi, "utf-8");
  } catch {
    /* no .gitignore yet */
  }
  const has = content.split("\n").some((l) => {
    const t = l.trim();
    return t === pattern || t === pattern.replace(/\/$/, "");
  });
  if (has) return;
  const prefix = content && !content.endsWith("\n") ? "\n" : "";
  await writeFile(gi, content + prefix + pattern + "\n");
}

/** Create the `.agents/{memory,decisions,skills}/` skeleton (with indices) and gitignore
 *  `.agents/` by default. Idempotent — never overwrites existing files. Returns the path. */
export async function scaffoldAgents(root: string = process.cwd()): Promise<string> {
  const agentsDir = path.join(root, AGENTS_DIR);
  await mkdir(path.join(agentsDir, "memory"), { recursive: true });
  await mkdir(path.join(agentsDir, "decisions"), { recursive: true });
  await mkdir(path.join(agentsDir, "skills"), { recursive: true });
  await writeIfAbsent(path.join(agentsDir, "memory", "MEMORY.md"), MEMORY_INDEX_TEMPLATE);
  await writeIfAbsent(path.join(agentsDir, "decisions", "README.md"), DECISIONS_README);
  await writeIfAbsent(path.join(agentsDir, "skills", "README.md"), SKILLS_README);
  await ensureGitignored(root, ".agents/");
  return agentsDir;
}

function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return s || "note";
}

/** Record one fact as a memory file and add it to the index (used by `/remember` and available
 *  to the agent). Scaffolds `.agents/memory/` if needed. `now` injected for deterministic tests.
 *  Returns the memo file path. */
export async function addMemory(
  root: string,
  fact: string,
  now: () => Date = () => new Date(),
): Promise<string> {
  const memDir = path.join(root, AGENTS_DIR, "memory");
  await mkdir(memDir, { recursive: true });
  const slug = slugify(fact);
  const file = `${slug}.md`;
  const date = now().toISOString().split("T")[0];
  await writeFile(path.join(memDir, file), `# ${slug}\n\n${fact}\n\n_added: ${date}_\n`);

  const indexPath = path.join(memDir, "MEMORY.md");
  let index = "";
  try {
    index = await readFile(indexPath, "utf-8");
  } catch {
    index = MEMORY_INDEX_TEMPLATE;
  }
  if (!index.includes(`(${file})`)) {
    const hook = fact.length > 60 ? fact.slice(0, 60).trimEnd() + "…" : fact;
    index = index.trimEnd() + `\n- [${slug}](${file}) — ${hook}\n`;
    await writeFile(indexPath, index);
  }
  return path.join(memDir, file);
}
