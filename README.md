<h1 align="center">interference</h1>

<p align="center"><strong>The open-source coding agent that lives in your terminal.</strong></p>

<p align="center">
  TypeScript + Bun · Plan / Build modes · 11 tools · permissions · sessions with undo · extensible skills · subagents · TUI
</p>

---

**interference** is an AI coding agent for the terminal. You describe a task; it explores your
codebase and edits files or runs commands through an agentic tool-calling loop — with explicit
permissions and a read-only **Plan** mode so nothing happens without your say-so.

## Features

- **11 tools**: `read` · `ls` · `glob` · `grep` · `webfetch` · `write` · `edit` · `bash` · `todowrite` · `question` · `task` (subagent)
- **Plan & Build** modes — explore read-only, switch to full access when ready
- **Permissioned by design** — allow / ask / deny enforced in code, not in the prompt; dangerous commands auto-blocked (`rm -rf`, `sudo`, `curl | sh`)
- **Extensible skills** — Agent Skills format (SKILL.md); auto-detected by keyword matching, or invoked via `/skill-name`; 3 skills bundled, user-extensible
- **Subagents** — delegate complex tasks to isolated agents (`explore` read-only, `general` full access, `review` for bug/security/simplicity findings); custom agents definable in `interference.json`; invoke several in the same turn to run them in parallel
- **Atomic edit** — unique-match string replacement with `replaceAll` support
- **Safe bash** — timeout, output truncation, exit code, dangerous-command deny list
- **Session persistence** — messages saved per-project, resume with `--continue`; `/sessions` picker
- **Undo / redo** — file snapshots before every mutation; `/undo` `/redo`
- **Slash commands** — `/help` `/clear` `/init` `/model` `/plan` `/build` `/undo` `/redo` `/compact` `/sessions` `/rename` `/provider` `/thinking` `/review`
- **Keyboard shortcuts** — `Esc` interrupts the current turn (keeps the work done so far), `Shift+Tab` cycles Plan/Build, `Ctrl+T` toggles the todo list, `Ctrl+O` collapses/expands tool output, `Ctrl+R` reverse-searches prompt history
- **`/init`** — analyzes your project and generates `AGENTS.md`
- **`/provider`** — manage API keys interactively (stored in `~/.interference/auth.json`)
- **Skill invocation** — explicit `/skill-name` + automatic keyword matching on description
- **Context compaction** — auto-summarizes conversation at ~90% context limit
- **Config file** — per-project `interference.json` (model, permissions, mode, instructions)
- **Diff view** — color-coded (+/-, green/red) in TUI for every edit/write
- **TUI with Ink** — `<Static>` history, streaming, spinner, TextInput, status footer (model / mode / context% / cost / git branch), pickers (model, provider, thinking), slash autocomplete, session list, toast, welcome screen, aligned markdown tables, reverse search over prompt history
- **Multi-provider** — DeepSeek, OpenAI, Anthropic (Claude), Zhipu (GLM), Moonshot (Kimi), Google (Gemini), Groq, xAI (Grok), Mistral, OpenRouter + any OpenAI-compatible endpoint; model picker grouped by provider; pricing/context from a live model catalog
- **Reasoning/thinking** — distinct `┄ thinking` blocks for every provider, enabled at max
- **Cost tracking** — real-time cost estimation per model
- **AGENTS.md & CLAUDE.md** — auto-loaded from project tree into system prompt
- **Italian** — made in Italy, MIT licensed, European

## Why

- **Terminal-native** — no editor lock-in, no web UI; just your shell
- **Permissioned by design** — allow / ask / deny enforced in code
- **European / by choice** — Italian, MIT, GDPR-native, no vendor lock-in
- **Radically transparent** — every tool call, reasoning step, and API cost shown live

## Stack

[Bun](https://bun.sh) · TypeScript · [Vercel AI SDK](https://ai-sdk.dev) (`ai` v7) · [zod](https://zod.dev) · [Ink 7.1](https://github.com/vadimdemedes/ink) + React 19.2 (TUI)

## Quickstart

```bash
bun install -g interference-agent
interference
```

On first run, use `/provider` to add your API keys. They're saved in `~/.interference/auth.json`.

interference stores its state in `~/.interference/` — sessions, skills, snapshots, and auth.

> Requires **Bun 1.3+**.

## Updating

```bash
bun install -g interference-agent@latest   # or: npm i -g interference-agent@latest
```

interference checks npm for new versions and shows a discreet notice when one is available; run `/update` from inside the app to upgrade.

## Releasing (maintainers)

Releases publish to npm automatically on tag push:

```bash
npm version minor        # runs typecheck+test, bumps, tags
git push --follow-tags   # the `publish` GitHub Action publishes to npm
```

Requires the `NPM_TOKEN` repo secret. See `CHANGELOG.md`.

## Screenshot

![interference CLI](assets/screenshot.png)

*(Capture your terminal with Cmd+Shift+4, save as `assets/screenshot.png`)*

## Landing page

A static landing page lives in [`site/`](site/).

## License

[MIT](LICENSE)
