<h1 align="center">interference</h1>

<p align="center"><strong>The open-source coding agent that lives in your terminal.</strong></p>

<p align="center">
  TypeScript&nbsp;+&nbsp;Bun · Plan&nbsp;/&nbsp;Build&nbsp;modes · file&nbsp;&amp;&nbsp;shell&nbsp;tools · permissions · sessions&nbsp;with&nbsp;undo · local&nbsp;&amp;&nbsp;cloud&nbsp;models
</p>

---

**interference** is an AI coding agent for the terminal. You describe a task; it explores your
codebase and edits files or runs commands through an agentic tool-calling loop — with explicit
permissions and a read-only **Plan** mode so nothing happens without your say-so.

```
you ask  →  it calls tools (read/grep/edit/bash)  →  you approve  →  undo anytime
```

## Why

- **Terminal-native** — no editor lock-in, no web UI; just your shell
- **Permissioned by design** — allow / ask / deny enforced in code, not in the prompt
- **Plan & Build** — explore read-only, then switch to full access when you're ready
- **Local & cloud** — Anthropic / OpenAI, or any OpenAI-compatible local endpoint
- **Bun-fast** — one toolchain; ships as a single standalone executable

## Stack

[Bun](https://bun.sh) · TypeScript · [Vercel AI SDK](https://ai-sdk.dev) (`ai` v7) · [zod](https://zod.dev) · [Ink](https://github.com/vadimdemedes/ink) (TUI)

## Quickstart

```bash
bun install
export ANTHROPIC_API_KEY="sk-..."   # or point at a local OpenAI-compatible endpoint
bun run interference
```

> Requires **Bun 1.3+** (and Node ≥22 / React ≥19.2 for the Ink TUI).

## Status

Early development — the agent is being built iteration by iteration: core loop → tools →
permissions → TUI → sessions → commands → local providers → subagents.

## Landing page

A static landing page lives in [`site/`](site/) (plain HTML/CSS/JS, self-contained). Open
`site/index.html` in a browser, or serve it with `bunx serve site`.

## License

[MIT](LICENSE)
