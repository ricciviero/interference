import type { ToolSet } from "ai";
import { readonlyTools, allToolsWithoutTask } from "../tools/registry.ts";

export type SubagentType = "explore" | "general";

export interface SubagentDef {
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolSet;
}

export const SUBAGENTS: Record<SubagentType, SubagentDef> = {
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
    tools: readonlyTools,
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
    tools: allToolsWithoutTask,
  },
};

export function getSubagent(type: string): SubagentDef | null {
  const t = type as SubagentType;
  return SUBAGENTS[t] ?? null;
}

export function listSubagents(): { type: string; description: string }[] {
  return Object.entries(SUBAGENTS).map(([type, def]) => ({
    type,
    description: def.description,
  }));
}
