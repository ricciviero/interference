import type { ToolSet } from "ai";
import { read } from "./read.ts";
import { ls } from "./ls.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { write } from "./write.ts";
import { edit } from "./edit.ts";
import { bash } from "./bash.ts";
import { webfetch } from "./webfetch.ts";
import { todowrite } from "./todowrite.ts";

export { read, ls, glob, grep, write, edit, bash, webfetch, todowrite };

export const readonlyTools: ToolSet = {
  read,
  ls,
  glob,
  grep,
  webfetch,
  todowrite,
};

export const allToolsWithoutTask: ToolSet = {
  read,
  ls,
  glob,
  grep,
  write,
  edit,
  bash,
  webfetch,
  todowrite,
};
