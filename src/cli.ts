#!/usr/bin/env bun
import { stdin, stdout } from "node:process";
import { currentModel, currentProvider } from "./config.ts";
import { MissingApiKeyError } from "./provider.ts";
import { createSession, latestSession, loadSession, saveSession, initStore } from "./session/store.ts";
import { initSnapshot } from "./session/snapshot.ts";
import { initInstructions } from "./agent/prompt.ts";
import { bootstrapSkills } from "./skills.ts";
import { initSkillCommands } from "./commands/index.ts";
import { loadConfig, applyConfig } from "./config-file.ts";
import { loadAuth, applyAuthToEnv } from "./auth.ts";
import { PROVIDERS } from "./config.ts";
import type { Session } from "./session/store.ts";

async function main(): Promise<void> {
  // Titolo + nome-icona della tab del terminale (come Claude Code), solo in TTY
  // (in pipe/non-TTY le sequenze OSC sporcherebbero l'output).
  // OSC 1 = icon/tab name, OSC 2 = window title.
  if (stdout.isTTY) {
    stdout.write("\x1b]1;◉ interference\x07\x1b]2;◉ interference\x07");
  }

  const provider = currentProvider();

  if (!process.env[provider.envKey]) {
    stdout.write(`\n${new MissingApiKeyError(provider).message}\n`);
    process.exit(1);
  }

  await initStore();
  await bootstrapSkills();

  const auth = await loadAuth();
  applyAuthToEnv(auth, Object.fromEntries(
    Object.entries(PROVIDERS).map(([pid, def]) => [pid, { label: def.label, envKey: def.envKey }])
  ));

  const config = await loadConfig();
  if (config) applyConfig(config);

  await initInstructions();
  await initSkillCommands();

  const args = Bun.argv.slice(2);
  const resumeId = args.includes("--continue")
    ? args[args.indexOf("--continue") + 1] ?? null
    : null;

  let session: Session;
  if (resumeId) {
    const s = await loadSession(resumeId);
    if (!s) {
      stdout.write(`Session ${resumeId} not found\n`);
      process.exit(1);
    }
    session = s;
  } else if (args.includes("--continue")) {
    const s = await latestSession();
    if (!s) {
      stdout.write("No previous session found\n");
      process.exit(1);
    }
    session = s;
  } else {
    session = createSession({
      mode: "build",
      provider: provider.label,
      model: currentModel(),
    });
  }

  initSnapshot(session.meta.id);

  if (stdin.isTTY) {
    const { default: App } = await import("./tui/App.tsx");
    const { createElement } = await import("react");
    const { render } = await import("ink");
    const { waitUntilExit } = render(createElement(App, { session }));
    await waitUntilExit;
    return;
  }

  const { default: plain } = await import("./cli-plain.ts");
  await plain(session);
}

main();
