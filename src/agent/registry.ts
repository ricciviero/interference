import type { ToolSet } from "ai";
import { readonlyTools, allToolsWithoutTask } from "../tools/registry.ts";
import { currentProviderId, cheapModelFor, type ThinkingLevel } from "../config.ts";
import type { ModelOverride } from "../provider.ts";
import { REVIEW_PROMPT } from "./prompts/review.ts";

// Subagents run autonomously: no todowrite (shared global state, would overwrite
// the main turn's list) nor question (no UI to ask the user).
const { todowrite: _roTodo, question: _roQ, ...readonlyForSub } = readonlyTools;
const { todowrite: _allTodo, question: _allQ, ...allForSub } = allToolsWithoutTask;

/** Definition of an agent (subagent) invocable via the `task` tool — built-in or custom
 *  from `interference.json#agents`. Unifies what was formerly `SubagentDef` (it. 34: declarative
 *  registry, replaces the hardcoded if on `subagent_type` in `task.ts`). */
export interface AgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolSet;
  /** "cheap" → resolved at runtime to the ACTIVE provider's cheapModel (it. 31); string → explicit id; absent → no override. */
  model?: "cheap" | string;
  thinking?: ThinkingLevel;
  /** true if the toolset includes mutating tools (write/edit/bash) — blocks execution in Plan mode. */
  mutating: boolean;
}

/** Minimal schema for a custom agent in `interference.json#agents`. */
export interface CustomAgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: "readonly" | "all";
  model?: "cheap" | "default" | string;
  thinking?: ThinkingLevel;
}

const BUILTIN: Record<string, AgentDef> = {
  explore: {
    name: "explore",
    description:
      "Fast agent specialized for exploring codebases. Use when you need to quickly find files by patterns, " +
      "search code for keywords, or answer questions about the codebase.",
    systemPrompt: `You are a specialized code exploration subagent. Your purpose is to investigate the codebase and answer questions.

You have ONLY read-only tools (read, ls, glob, grep). You CANNOT write, edit, or execute commands.

Rules:
- Be fast and thorough — search broadly, then narrow down
- When you find the answer, summarize it clearly with file:line references
- Do NOT suggest edits, create files, or run commands
- If you can't find something after reasonable search, say so explicitly
- Return your findings as a concise report`,
    tools: readonlyForSub,
    model: "cheap",
    thinking: "low",
    mutating: false,
  },

  general: {
    name: "general",
    description:
      "General-purpose agent for researching complex questions and executing multi-step tasks. " +
      "Has full access to all tools.",
    systemPrompt: `You are a general-purpose subagent. Execute the given task using all available tools.

Rules:
- Be thorough — explore, read, write, edit, and run commands as needed
- Summarize your approach before executing
- Report results clearly with file:line references
- If you encounter errors, try to correct them before giving up
- Do NOT spawn other subagents (the task tool is not available to you)`,
    tools: allForSub,
    mutating: true,
  },

  review: {
    name: "review",
    description:
      "Reviews a diff or code snippet for bugs, security issues, and over-engineering/simplification " +
      "opportunities (distilled from code-review + security-review + simplify). Read-only, does not fix.",
    systemPrompt: REVIEW_PROMPT,
    tools: readonlyForSub,
    model: "cheap",
    thinking: "low",
    mutating: false,
  },
};

let customAgents: Record<string, AgentDef> = {};

/** Loads custom agents from `interference.json#agents` (called by `applyConfig`).
 *  A custom can override a built-in by name. */
export function loadCustomAgents(configs: CustomAgentConfig[] | undefined): void {
  customAgents = {};
  if (!configs) return;
  for (const c of configs) {
    customAgents[c.name] = {
      name: c.name,
      description: c.description,
      systemPrompt: c.prompt,
      tools: c.tools === "readonly" ? readonlyForSub : allForSub,
      model: c.model === "default" ? undefined : c.model,
      thinking: c.thinking,
      mutating: c.tools !== "readonly",
    };
  }
}

export function getAgent(name: string): AgentDef | null {
  return customAgents[name] ?? BUILTIN[name] ?? null;
}

export function listAgents(): { name: string; description: string }[] {
  return Object.values({ ...BUILTIN, ...customAgents }).map((def) => ({
    name: def.name,
    description: def.description,
  }));
}

/** Resolves the ModelOverride (it. 31) from an AgentDef, declarative instead of a
 *  hardcoded per-name if: any agent (built-in or custom) with `model: "cheap"`
 *  runs on the ACTIVE provider's cheapModel, without mutating global state. */
export function resolveAgentModelOverride(def: AgentDef): ModelOverride | undefined {
  if (!def.model && !def.thinking) return undefined;
  const pid = currentProviderId();
  const model = def.model === "cheap" ? cheapModelFor(pid) : def.model;
  return { provider: pid, model, thinkingLevel: def.thinking };
}
