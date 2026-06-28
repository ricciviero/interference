#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ModelMessage } from "ai";
import { currentModel, currentProvider, currentMode, setMode } from "./config.ts";
import { runTurn } from "./agent/loop.ts";
import type { Chunk } from "./agent/loop.ts";
import { MissingApiKeyError } from "./provider.ts";
import { setConfirmHandler } from "./permissions.ts";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const provider = currentProvider();
  const mode = currentMode();
  const modeLabel = mode === "plan" ? "Plan" : "Build";
  stdout.write(
    `${BOLD}interference${RESET} ${DIM}· ${provider.label} · ${currentModel()} · ${modeLabel}${RESET}\n`,
  );

  if (!process.env[provider.envKey]) {
    stdout.write(`\n${new MissingApiKeyError(provider).message}\n`);
    process.exit(1);
  }

  stdout.write(`${DIM}Type a message · /exit to quit · /build to switch mode · Ctrl-C to interrupt${RESET}\n\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const messages: ModelMessage[] = [];
  let aborter: AbortController | null = null;

  // Conferma azioni `ask` (event-driven): invocata dentro l'execute del tool.
  setConfirmHandler(async (toolName, preview) => {
    stdout.write(`\n${YELLOW}${preview}${RESET}\n${YELLOW}  Allow ${toolName}?${RESET} [y/N] `);
    let ans: string;
    try {
      ans = (await rl.question("")).trim().toLowerCase();
    } catch {
      ans = "n";
    }
    const ok = ans === "y" || ans === "yes";
    stdout.write(ok ? `${DIM}  → executing…${RESET}\n` : `${DIM}  → refused${RESET}\n`);
    return ok;
  });
  const kHandler = handleKey(rl, () => {
    if (aborter) {
      aborter.abort();
      aborter = null;
      stdout.write(`\n${DIM}[interrupted]${RESET}\n`);
    }
  });

  rl.on("SIGINT", kHandler);

  try {
    while (true) {
      let input: string;
      try {
        input = (await rl.question(`${BOLD}›${RESET} `)).trim();
      } catch {
        break;
      }
      if (input.length === 0) continue;
      if (input === "/exit" || input === "/quit") break;

      if (input === "/plan") {
        setMode("plan");
        stdout.write(`${DIM}Switched to Plan mode (read-only)${RESET}\n\n`);
        continue;
      }
      if (input === "/build") {
        setMode("build");
        stdout.write(`${DIM}Switched to Build mode (full access)${RESET}\n\n`);
        continue;
      }

      messages.push({ role: "user", content: input });
      aborter = new AbortController();
      try {
        await consumeTurn(runTurn(messages, aborter.signal));
        stdout.write("\n\n");
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
      } finally {
        aborter = null;
      }
    }
  } finally {
    rl.close();
  }
}

async function consumeTurn(chunks: AsyncGenerator<Chunk>): Promise<void> {
  let sawReasoning = false;
  let inText = false;
  let activeTool: { name: string; args: string } | null = null;

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case "reasoning":
        if (!sawReasoning) {
          stdout.write(`${DIM}┄ thinking${RESET}\n`);
          sawReasoning = true;
        }
        stdout.write(`${DIM}${chunk.text}${RESET}`);
        break;

      case "text":
        if (activeTool) {
          stdout.write("\n");
          activeTool = null;
        }
        if (sawReasoning && !inText) {
          stdout.write(`\n${DIM}┄${RESET}\n\n`);
          inText = true;
        } else if (!inText) {
          inText = true;
        }
        stdout.write(chunk.text);
        break;

      case "tool-call": {
        const args =
          typeof chunk.input === "string"
            ? chunk.input
            : JSON.stringify(chunk.input);
        const label = `${DIM}· ${chunk.toolName}${RESET}(${args})`;
        if (sawReasoning && !inText) {
          stdout.write(`\n${DIM}┄${RESET}\n\n`);
          inText = true;
        } else if (activeTool || !inText) {
          stdout.write("\n");
        }
        stdout.write(label);
        activeTool = { name: chunk.toolName, args };
        break;
      }

      case "tool-result":
        if (chunk.isError) {
          stdout.write(`\n${RED}  → error${RESET}: ${chunk.output.slice(0, 200)}`);
        } else {
          const preview =
            chunk.output.length > 120
              ? chunk.output.slice(0, 120).replace(/\n/g, " ") + "…"
              : chunk.output.replace(/\n/g, " ");
          stdout.write(`\n${DIM}  →${RESET} ${preview}`);
        }
        activeTool = null;
        break;
    }
  }
}

function handleKey(
  rl: readline.Interface,
  onInterrupt: () => void,
): () => void {
  return () => {
    onInterrupt();
  };
}

main();
