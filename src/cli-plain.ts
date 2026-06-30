#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { currentModel, currentProvider, currentMode, setMode } from "./config.ts";
import { runTurn } from "./agent/loop.ts";
import type { Chunk } from "./agent/loop.ts";
import { MissingApiKeyError } from "./provider.ts";
import { setConfirmHandler } from "./permissions.ts";
import { setAnswerHandler, type Answers } from "./tools/question.ts";
import { saveSession, loadSession, listSessions } from "./session/store.ts";
import type { Session } from "./session/store.ts";
import { nextTurn, undo, redo, finalizeSnapshots } from "./session/snapshot.ts";
import { dispatch, isSlashCommand } from "./commands/index.ts";
import { matchSkills, getCachedRegistry, loadSkillBody } from "./skills.ts";
import { shouldCompact, compactMessages, getUsagePercent } from "./agent/compaction.ts";
import { computeDiff, formatDiff } from "./tui/DiffView.tsx";
import { estimateCost, formatCost } from "./cost.ts";
import { estimateMessagesTokens } from "./agent/compaction.ts";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

export default async function plain(session: Session): Promise<void> {
  const provider = currentProvider();
  const mode = currentMode();
  const modeLabel = mode === "plan" ? "Plan" : "Build";
  const modeSymbol = mode === "plan" ? "⬡" : "⬢";

  stdout.write(`\n${BOLD}  interference${RESET}  ${DIM}the open-source coding agent${RESET}\n`);
  stdout.write(`${DIM}  ______________________________${RESET}\n`);
  stdout.write(`\n`);
  stdout.write(
    `${DIM}  ${modeSymbol} ${modeLabel}${RESET}  ${DIM}·${RESET}  ${provider.label}  ${DIM}·${RESET}  ${currentModel()}  ${DIM}·${RESET}  ${getUsagePercent(session.messages)}% ctx  ${DIM}·${RESET}  ${formatCost(estimateCost(estimateMessagesTokens(session.messages)))}${RESET}\n`,
  );
  stdout.write(`\n`);

  if (session.messages.length > 0) {
    stdout.write(`${DIM}  ↳ Resumed ${session.meta.id.slice(0, 12)} (${session.meta.turnCount} turns)${RESET}\n\n`);
  }

  stdout.write(`  ${DIM}Type a message · /help · /build · /sessions · Ctrl-C${RESET}\n\n`);

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

  setAnswerHandler(async (qs) => {
    const answers: Answers = [];
    for (const q of qs) {
      stdout.write(`\n${BOLD}${q.header ? `[${q.header}] ` : ""}${q.question}${RESET}\n`);
      q.options.forEach((o, i) => {
        stdout.write(`  ${i + 1}. ${o.label}${o.description ? `${DIM} — ${o.description}${RESET}` : ""}\n`);
      });
      const hint = q.multiple ? "numbers separated by comma (e.g. 1,3)" : "a number";
      let raw: string;
      try { raw = (await rl.question(`${DIM}  choose ${hint} (Enter to skip): ${RESET}`)).trim(); } catch { raw = ""; }
      const idxs = raw
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((n) => Number.isInteger(n) && n >= 0 && n < q.options.length);
      const picked = (q.multiple ? idxs : idxs.slice(0, 1)).map((n) => q.options[n]!.label);
      answers.push(picked);
    }
    return answers;
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

      if (isSlashCommand(input)) {
        const result = await dispatch(input, {
          setMode: (m) => { setMode(m); session.meta.mode = m; },
          clearMessages: () => { messages.length = 0; },
          doInit: async (args) => {
            // /init delegates to the agent — run a turn with the init template
            const template = `Generate or update the AGENTS.md file at the project root.

Follow the bundled agents-setup skill (see system prompt). Key sections:
- Project overview, stack, directory structure
- Build/test commands, code conventions  
- Agent skills and triggers
- Non-negotiable rules

How to proceed:
1. Use ls, glob, grep, and read to explore the project thoroughly
2. Identify languages, frameworks, build system, test setup, conventions
3. Write AGENTS.md at the project root using the write tool
4. Confirm the file was created and summarize its contents

${args ? `Additional context: ${args}` : ""}`;
            nextTurn();
            messages.push({ role: "user", content: template });
            aborter = new AbortController();
            try {
              await consumeTurn(runTurn(messages, aborter.signal));
              session.meta.turnCount++;
              await finalizeSnapshots();
              await saveSession(session);
              return "AGENTS.md generated successfully.";
            } catch (err) {
              messages.pop();
              return `Init failed: ${err instanceof Error ? err.message : String(err)}`;
            } finally { aborter = null; }
          },
          doSkill: async (name, body) => {
            nextTurn();
            messages.push({ role: "user", content: input });
            aborter = new AbortController();
            try {
              await consumeTurn(runTurn(messages, aborter.signal, undefined, [body]));
              session.meta.turnCount++;
              await finalizeSnapshots();
              await saveSession(session);
              return `Skill '${name}' executed.`;
            } catch (err) {
              messages.pop();
              return `Skill failed: ${err instanceof Error ? err.message : String(err)}`;
            } finally { aborter = null; }
          },
          doSessions: async () => {
            const list = await listSessions();
            if (list.length === 0) return "No sessions found.";
            stdout.write(`\n${DIM}Sessions:${RESET}\n`);
            for (let i = 0; i < Math.min(list.length, 15); i++) {
              const s = list[i]!;
              stdout.write(`  ${DIM}${i + 1}.${RESET} ${s.id.slice(0, 12)} ${DIM}· ${s.mode} · ${s.turnCount}t · ${s.updatedAt.slice(0, 10)}${RESET}\n`);
            }
            stdout.write(`${DIM}Enter number to resume or 0 to cancel: ${RESET}`);
            let choice: string;
            try { choice = (await rl.question("")).trim(); } catch { return "Cancelled."; }
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < list.length && list[idx]) {
              const loaded = await loadSession(list[idx]!.id);
              if (loaded) {
                messages.length = 0;
                messages.push(...loaded.messages);
                session.meta = loaded.meta;
                session.messages = loaded.messages;
                return `Resumed session ${list[idx]!.id.slice(0, 12)} (${loaded.meta.turnCount} turns).`;
              }
              return "Session not found.";
            }
            return "Cancelled.";
          },
          doRename: async (name) => {
            session.meta.id = name;
            await saveSession(session);
            return `Session renamed to '${name}'.`;
          },
        });
        if (result) stdout.write(`${DIM}${result}${RESET}\n\n`);
        continue;
      }

      const matchedSkills = matchSkills(input, getCachedRegistry());
      const skillBodies: string[] = [];
      for (const name of matchedSkills) {
        const body = await loadSkillBody(name);
        if (body) skillBodies.push(body);
      }
      if (skillBodies.length > 0) {
        stdout.write(`${DIM}Skills matched: ${matchedSkills.join(", ")}${RESET}\n`);
      }

      nextTurn();
      messages.push({ role: "user", content: input });
      aborter = new AbortController();
      try {
        await consumeTurn(runTurn(messages, aborter.signal, undefined, skillBodies.length > 0 ? skillBodies : undefined));
        stdout.write("\n\n");
        session.meta.turnCount++;
        await finalizeSnapshots();
        await saveSession(session);

        if (shouldCompact(messages)) {
          const pct = getUsagePercent(messages);
          stdout.write(`${DIM}Context at ${pct}%, compacting...${RESET}\n`);
          const compacted = await compactMessages(messages);
          messages.length = 0;
          messages.push(...compacted);
          session.messages = messages;
          await saveSession(session);
          stdout.write(`${DIM}Compacted. ${getUsagePercent(messages)}% context used.${RESET}\n`);
        }
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
  let activeTool: { name: string; args: string; input: unknown } | null = null;

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case "reasoning":
        if (!sawReasoning) { stdout.write(`${YELLOW}✻ Thinking${RESET}\n`); sawReasoning = true; }
        stdout.write(`${DIM}${chunk.text}${RESET}`);
        break;
      case "text":
        if (activeTool) { stdout.write("\n"); activeTool = null; }
        if (sawReasoning && !inText) { stdout.write(`\n\n`); inText = true; }
        else if (!inText) { inText = true; }
        stdout.write(chunk.text);
        break;
      case "tool-call": {
        const args = typeof chunk.input === "string" ? chunk.input : JSON.stringify(chunk.input);
        if (sawReasoning && !inText) { stdout.write(`\n\n`); inText = true; }
        else if (activeTool || !inText) { stdout.write("\n"); }
        stdout.write(`${DIM}· ${chunk.toolName}${RESET}(${args})`);
        activeTool = { name: chunk.toolName, args, input: chunk.input };
        break;
      }
      case "tool-result":
        if (chunk.isError) {
          stdout.write(`\n${RED}  → error${RESET}: ${chunk.output.slice(0, 200)}`);
        } else if (activeTool && (activeTool.name === "write" || activeTool.name === "edit")) {
          const input = activeTool.input as Record<string, unknown> | undefined;
          let diffText = "";
          if (activeTool.name === "edit" && input && typeof input.oldString === "string" && typeof input.newString === "string") {
            diffText = formatDiff(computeDiff(
              (input.oldString as string).split("\n"),
              (input.newString as string).split("\n"),
            ));
          } else if (activeTool.name === "write" && input && typeof input.content === "string") {
            diffText = formatDiff(computeDiff([], (input.content as string).split("\n")));
          }
          if (diffText) {
            stdout.write(`\n${DIM}  → diff:${RESET}\n${diffText}`);
          } else {
            const p = chunk.output.length > 120 ? chunk.output.slice(0, 120).replace(/\n/g, " ") + "…" : chunk.output.replace(/\n/g, " ");
            stdout.write(`\n${DIM}  →${RESET} ${p}`);
          }
        } else {
          const p = chunk.output.length > 120 ? chunk.output.slice(0, 120).replace(/\n/g, " ") + "…" : chunk.output.replace(/\n/g, " ");
          stdout.write(`\n${DIM}  →${RESET} ${p}`);
        }
        activeTool = null;
        break;
    }
  }
}
