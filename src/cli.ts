#!/usr/bin/env bun
import { stdin, stdout } from "node:process";
import { currentModel, currentProvider, currentProviderId } from "./config.ts";
import { loadOpenRouterModels } from "./openrouter.ts";
import { createSession, latestSession, loadSession, saveSession, initStore } from "./session/store.ts";
import { restoreUsage } from "./cost.ts";
import { initSnapshot } from "./session/snapshot.ts";
import { initInstructions } from "./agent/prompt.ts";
import { bootstrapSkills } from "./skills.ts";
import { initSkillCommands } from "./commands/index.ts";
import { loadConfig, applyConfig } from "./config-file.ts";
import { loadAuth, applyAuthToEnv } from "./auth.ts";
import { loadCatalog } from "./catalog.ts";
import { PROVIDERS } from "./config.ts";
import type { Session } from "./session/store.ts";
import { CURRENT_VERSION } from "./version.ts";

async function main(): Promise<void> {
  // --version / -v: print the version and exit (before everything else).
  const cliArgs = Bun.argv.slice(2);
  if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
    stdout.write(`${CURRENT_VERSION}\n`);
    return;
  }

  // Terminal tab/window title, only in TTY
  // (in a pipe/non-TTY, OSC sequences would pollute the output).
  // OSC 1 = icon/tab name, OSC 2 = window title.
  if (stdout.isTTY) {
    stdout.write("\x1b]1;◉ interference\x07\x1b]2;◉ interference\x07");
  }

  const provider = currentProvider();

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
  // Model catalog (it. 37): on-disk cache -> remote fetch -> embedded offline snapshot.
  // Never throws; if slow (first run, expired cache) doesn't block beyond the fetch.
  await loadCatalog();
  // OpenRouter's live model catalog (its /models endpoint) — only when that provider is
  // selected, so users on other providers don't pay the fetch. Makes cost/context accurate
  // from the first turn; the /model picker loads it too when opened. Never throws.
  if (currentProviderId() === "openrouter") await loadOpenRouterModels();

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

  // Restore cumulative cost from the (possibly resumed) session so it survives --continue
  // — covers both the TUI and the plain fallback below (fix/11).
  restoreUsage(session.usage);

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
