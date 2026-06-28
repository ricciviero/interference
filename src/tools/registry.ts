import type { ToolSet } from "ai";
import { read } from "./read.ts";
import { ls } from "./ls.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { write } from "./write.ts";
import { edit } from "./edit.ts";
import { bash } from "./bash.ts";

export { read, ls, glob, grep, write, edit, bash };

export const readonlyTools: ToolSet = {
  read,
  ls,
  glob,
  grep,
};

export const allToolsWithoutTask: ToolSet = {
  read,
  ls,
  glob,
  grep,
  write,
  edit,
  bash,
};
