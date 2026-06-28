import { read } from "./read.ts";
import { ls } from "./ls.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { write } from "./write.ts";
import { edit } from "./edit.ts";
import { bash } from "./bash.ts";
import type { ToolSet } from "ai";

export { read, ls, glob, grep, write, edit, bash };

export const readonlyTools: ToolSet = {
  read,
  ls,
  glob,
  grep,
};

export const allTools: ToolSet = {
  read,
  ls,
  glob,
  grep,
  write,
  edit,
  bash,
};

export type AgentMode = "plan" | "build";

export function toolsForMode(mode: AgentMode): ToolSet {
  return mode === "plan" ? readonlyTools : allTools;
}

export function isReadonlyTool(name: string): boolean {
  return name in readonlyTools;
}
