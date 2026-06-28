#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { currentModel, currentProvider, currentMode, setMode } from "./config.ts";
import { runTurn } from "./agent/loop.ts";
import type { Chunk } from "./agent/loop.ts";
import { MissingApiKeyError } from "./provider.ts";
import { setConfirmHandler } from "./permissions.ts";
import { saveSession } from "./session/store.ts";
import type { Session } from "./session/store.ts";
import { nextTurn, undo, redo, finalizeSnapshots } from "./session/snapshot.ts";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

export default async function plain(session: Session): Promise<void> {
  const provider = currentProvider();
  const mode = currentMode();
  const modeLabel = mode === "plan" ? "Plan" : "Build";
  stdout.write(
    `${BOLD}interference${RESET} ${DIM}· ${provider.label} · ${currentModel()} · ${modeLabel}${RESET}\n`,
  );

  if (session.messages.length > 0) {
    stdout.write(`${DIM}Resumed session ${session.meta.id} (${session.meta.turnCount} turns)${RESET}\n`);
  }

  stdout.write(`${DIM}Type a message · /exit · /build · /undo · /redo · Ctrl-C${RESET}\n\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const messages = session.messages;
  let aborter: AbortController | null = null;

  setConfirmHandler(async (toolName, preview) => {
    stdout.write(`\n${YELLOW}${preview}${RESET}\n${YELLOW}  Allow ${toolName}?${RESET} [y/N] `);
    let ans: string;
    try { ans = (await rl.question("")).trim().toLowerCase(); } catch { ans = "n"; }
    const ok = ans === "y" || ans === "yes";
    stdout.write(ok ? `${DIM}  → executing…${RESET}\n` : `${DIM}  → refused${RESET}\n`);
    return ok;
  });

  rl.on("SIGINT", () => {
    if (aborter) { aborter.abort(); aborter = null; stdout.write(`\n${DIM}[interrupted]${RESET}\n`); }
    else { stdout.write("\n"); rl.close(); }
  });

  try {
    while (true) {
      let input: string;
      try { input = (await rl.question(`${BOLD}›${RESET} `)).trim(); } catch { break; }
      if (input.length === 0) continue;
      if (input === "/exit" || input === "/quit") break;
      if (input === "/plan") { setMode("plan"); session.meta.mode = "plan"; stdout.write(`${DIM}Plan mode${RESET}\n\n`); continue; }
      if (input === "/build") { setMode("build"); session.meta.mode = "build"; stdout.write(`${DIM}Build mode${RESET}\n\n`); continue; }
      if (input === "/undo") {
        const files = await undo();
        if (files.length > 0) {
          stdout.write(`${DIM}Undo: restored ${files.join(", ")}${RESET}\n\n`);
        } else {
          stdout.write(`${DIM}Nothing to undo${RESET}\n\n`);
        }
        continue;
      }
      if (input === "/redo") {
        const files = await redo();
        if (files.length > 0) {
          stdout.write(`${DIM}Redo: restored ${files.join(", ")}${RESET}\n\n`);
        } else {
          stdout.write(`${DIM}Nothing to redo${RESET}\n\n`);
        }
        continue;
      }

      nextTurn();
      messages.push({ role: "user", content: input });
      aborter = new AbortController();
      try {
        await consumeTurn(runTurn(messages, aborter.signal));
        stdout.write("\n\n");
        session.meta.turnCount++;
        await finalizeSnapshots();
        await saveSession(session);
      } catch (err) {
        messages.pop();
        if (err instanceof MissingApiKeyError) {
          stdout.write(`\n${err.message}\n\n`);
        } else if (aborter === null) {
          // abort
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          stdout.write(`\n${DIM}[error]${RESET} ${msg}\n\n`);
        }
      } finally { aborter = null; }
    }
  } finally { rl.close(); }
}

async function consumeTurn(chunks: AsyncGenerator<Chunk>): Promise<void> {
  let sawReasoning = false;
  let inText = false;
  let activeTool: { name: string; args: string } | null = null;

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case "reasoning":
        if (!sawReasoning) { stdout.write(`${DIM}┄ thinking${RESET}\n`); sawReasoning = true; }
        stdout.write(`${DIM}${chunk.text}${RESET}`);
        break;
      case "text":
        if (activeTool) { stdout.write("\n"); activeTool = null; }
        if (sawReasoning && !inText) { stdout.write(`\n${DIM}┄${RESET}\n\n`); inText = true; }
        else if (!inText) { inText = true; }
        stdout.write(chunk.text);
        break;
      case "tool-call": {
        const args = typeof chunk.input === "string" ? chunk.input : JSON.stringify(chunk.input);
        if (sawReasoning && !inText) { stdout.write(`\n${DIM}┄${RESET}\n\n`); inText = true; }
        else if (activeTool || !inText) { stdout.write("\n"); }
        stdout.write(`${DIM}· ${chunk.toolName}${RESET}(${args})`);
        activeTool = { name: chunk.toolName, args };
        break;
      }
      case "tool-result":
        if (chunk.isError) {
          stdout.write(`\n${RED}  → error${RESET}: ${chunk.output.slice(0, 200)}`);
        } else {
          const p = chunk.output.length > 120 ? chunk.output.slice(0, 120).replace(/\n/g, " ") + "…" : chunk.output.replace(/\n/g, " ");
          stdout.write(`\n${DIM}  →${RESET} ${p}`);
        }
        activeTool = null;
        break;
    }
  }
}
