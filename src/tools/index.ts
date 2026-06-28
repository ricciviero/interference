import { read, ls, glob, grep, write, edit, bash, readonlyTools, allToolsWithoutTask } from "./registry.ts";
import { task } from "./task.ts";
import type { ToolSet } from "ai";

export { read, ls, glob, grep, write, edit, bash, task };
export { readonlyTools };

export const allTools: ToolSet = {
  ...allToolsWithoutTask,
  task,
};

export type AgentMode = "plan" | "build";

export function toolsForMode(mode: AgentMode): ToolSet {
  return mode === "plan" ? readonlyTools : allTools;
}

export function isReadonlyTool(name: string): boolean {
  return name in readonlyTools;
}
