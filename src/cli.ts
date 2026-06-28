#!/usr/bin/env bun
// Entry CLI (RF-CORE-01). REPL readline: legge un messaggio, lo invia all'agente
// e ne streamma la risposta. La TUI ricca (Ink) arriva nell'it. 04.

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ModelMessage } from "ai";
import { currentModel, currentProvider } from "./config.ts";
import { runTurn } from "./agent/loop.ts";
import { MissingApiKeyError } from "./provider.ts";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const provider = currentProvider();
  stdout.write(
    `${BOLD}interference${RESET} ${DIM}· ${provider.label} · ${currentModel()}${RESET}\n`,
  );

  // Fail-fast con messaggio chiaro se manca la chiave del provider attivo (RF-CORE-02).
  if (!process.env[provider.envKey]) {
    stdout.write(`\n${new MissingApiKeyError(provider).message}\n`);
    process.exit(1);
  }

  stdout.write(`${DIM}Type a message · /exit to quit · Ctrl-C to interrupt${RESET}\n\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const messages: ModelMessage[] = [];
  let aborter: AbortController | null = null;

  // Ctrl-C: se c'è un turno in corso lo interrompe; altrimenti esce pulito.
  rl.on("SIGINT", () => {
    if (aborter) {
      aborter.abort();
      aborter = null;
      stdout.write(`\n${DIM}[interrupted]${RESET}\n`);
    } else {
      stdout.write("\n");
      rl.close();
    }
  });

  try {
    while (true) {
      let input: string;
      try {
        input = (await rl.question(`${BOLD}›${RESET} `)).trim();
      } catch {
        break; // rl chiuso (Ctrl-C / EOF)
      }
      if (input.length === 0) continue;
      if (input === "/exit" || input === "/quit") break;

      messages.push({ role: "user", content: input });
      aborter = new AbortController();
      let sawReasoning = false;
      let inText = false;
      try {
        for await (const chunk of runTurn(messages, aborter.signal)) {
          if (chunk.type === "reasoning") {
            if (!sawReasoning) {
              stdout.write(`${DIM}┄ thinking${RESET}\n`);
              sawReasoning = true;
            }
            stdout.write(`${DIM}${chunk.text}${RESET}`);
          } else {
            if (sawReasoning && !inText) stdout.write(`\n${DIM}┄${RESET}\n\n`);
            inText = true;
            stdout.write(chunk.text);
          }
        }
        stdout.write("\n\n");
        // runTurn ha già accodato la response (con reasoning) alla history.
      } catch (err) {
        // Turno fallito/interrotto: scarta il messaggio utente per coerenza history.
        messages.pop();
        if (err instanceof MissingApiKeyError) {
          stdout.write(`\n${err.message}\n\n`);
        } else if (aborter === null) {
          // abort volontario: già segnalato dall'handler SIGINT
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

main();
