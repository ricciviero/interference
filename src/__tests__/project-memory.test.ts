import { describe, test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { findAgentsDir, loadProjectMemory, projectSkillsDir, scaffoldAgents, addMemory } from "../projectMemory.ts";
import { buildSystemPrompt } from "../agent/prompt.ts";

async function makeProject(memos: Record<string, string>, index?: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pm-"));
  const memDir = path.join(root, ".agents", "memory");
  await mkdir(memDir, { recursive: true });
  if (index !== undefined) await writeFile(path.join(memDir, "MEMORY.md"), index);
  for (const [name, body] of Object.entries(memos)) {
    await writeFile(path.join(memDir, name), body);
  }
  return root;
}

describe("findAgentsDir", () => {
  test("finds .agents/ walking up from a subdirectory", async () => {
    const root = await makeProject({ "a.md": "x" });
    const sub = path.join(root, "src", "deep");
    await mkdir(sub, { recursive: true });
    expect(findAgentsDir(sub)).toBe(path.join(root, ".agents"));
  });

  test("returns null when there is no .agents/", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "noag-"));
    expect(findAgentsDir(root)).toBeNull();
  });
});

describe("loadProjectMemory", () => {
  test("concatenates the MEMORY.md index and every topic memo", async () => {
    const root = await makeProject(
      { "stripe.md": "Stripe is in test mode.", "deploy.md": "Deploys to EC2, not VPS." },
      "# Memory\n- stripe — test mode\n- deploy — EC2",
    );
    const mem = await loadProjectMemory(root);
    expect(mem).toContain("# Memory");
    expect(mem).toContain("Stripe is in test mode.");
    expect(mem).toContain("Deploys to EC2, not VPS.");
    expect(mem).toContain("### stripe.md");
  });

  test("returns null when the project has no .agents/memory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "empty-"));
    expect(await loadProjectMemory(root)).toBeNull();
  });

  test("index alone (no memo files) still loads", async () => {
    const root = await makeProject({}, "# Memory\n(nothing yet)");
    expect(await loadProjectMemory(root)).toContain("(nothing yet)");
  });
});

describe("projectSkillsDir", () => {
  test("returns the .agents/skills path when it exists", async () => {
    const root = await makeProject({ "a.md": "x" });
    await mkdir(path.join(root, ".agents", "skills"), { recursive: true });
    expect(projectSkillsDir(root)).toBe(path.join(root, ".agents", "skills"));
  });

  test("null when .agents exists but skills/ does not", async () => {
    const root = await makeProject({ "a.md": "x" });
    expect(projectSkillsDir(root)).toBeNull();
  });
});

describe("system prompt injection", () => {
  test("project memory is injected as <project_memory> when present", () => {
    const p = buildSystemPrompt({ mode: "build", memory: "MEMKEY: deploy goes to EC2." });
    expect(p).toContain("<project_memory>");
    expect(p).toContain("MEMKEY: deploy goes to EC2.");
    expect(p).toContain("</project_memory>");
  });

  test("no <project_memory> block when there is no memory", () => {
    const p = buildSystemPrompt({ mode: "build" });
    expect(p).not.toContain("<project_memory>");
  });
});

describe("scaffoldAgents (F3)", () => {
  test("creates the .agents skeleton with indices and gitignores it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaf-"));
    await scaffoldAgents(root);
    expect(existsSync(path.join(root, ".agents", "memory", "MEMORY.md"))).toBe(true);
    expect(existsSync(path.join(root, ".agents", "decisions", "README.md"))).toBe(true);
    expect(existsSync(path.join(root, ".agents", "skills", "README.md"))).toBe(true);
    const gi = await readFile(path.join(root, ".gitignore"), "utf-8");
    expect(gi).toContain(".agents/");
  });

  test("is idempotent: does not overwrite an existing memo or duplicate the gitignore line", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaf2-"));
    await scaffoldAgents(root);
    await writeFile(path.join(root, ".agents", "memory", "MEMORY.md"), "MY CUSTOM INDEX");
    await scaffoldAgents(root); // second run
    expect(await readFile(path.join(root, ".agents", "memory", "MEMORY.md"), "utf-8")).toBe("MY CUSTOM INDEX");
    const gi = await readFile(path.join(root, ".gitignore"), "utf-8");
    expect(gi.match(/\.agents\//g)?.length).toBe(1); // not duplicated
  });
});

describe("addMemory (F4)", () => {
  test("writes a memo file and indexes it in MEMORY.md", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "add-"));
    const fp = await addMemory(root, "The deploy target is EC2, not the VPS.", () => new Date("2026-07-07"));
    expect(existsSync(fp)).toBe(true);
    const body = await readFile(fp, "utf-8");
    expect(body).toContain("The deploy target is EC2, not the VPS.");
    expect(body).toContain("_added: 2026-07-07_");
    const index = await readFile(path.join(root, ".agents", "memory", "MEMORY.md"), "utf-8");
    expect(index).toContain("The deploy target is EC2");
  });
});

describe("F5 — the full cycle: remember → reload → in the prompt", () => {
  test("a remembered fact comes back in the next session's system prompt", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cycle-"));
    // Session 1: the agent (or /remember) records a fact.
    await addMemory(root, "The API base URL is https://api.example.test.");
    // Session 2 (fresh): memory is loaded from disk and injected into the prompt.
    const mem = await loadProjectMemory(root);
    const prompt = buildSystemPrompt({ mode: "build", memory: mem ?? undefined });
    expect(prompt).toContain("<project_memory>");
    expect(prompt).toContain("The API base URL is https://api.example.test.");
  });
});
