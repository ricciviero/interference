# Architettura tecnica — interference

Companion di [`requisiti.md`](requisiti.md). Struttura del codice, layer, flussi.

---

## 1. Stack

| Livello | Scelta | Note |
|---|---|---|
| Runtime / PM / build / test | **Bun 1.3+** | un solo tool; `bun build --compile` per eseguibile single-file (skill `bun-typescript`) |
| Linguaggio | **TypeScript** strict | `@types/bun`, moduleResolution bundler |
| LLM / agent | **Vercel AI SDK v7** (`ai`) | `streamText` + `tool()`+zod + `stopWhen: stepCountIs`; provider Anthropic/OpenAI/OpenAI-compatible (skill `ai-sdk-agents`) |
| Schema tool | **zod** | `inputSchema` dei tool |
| TUI | **Ink 7** (React per terminale) | `<Static>` per streaming; React ≥19.2, Node ≥22 (skill `terminal-ui-ink`) |
| Pattern agente | — | agent loop, tool, permessi, Plan/Build, sessioni, subagent (skill `coding-agent-architecture`) |

---

## 2. Struttura del progetto (target)

```
interference/
├── package.json            # bin: interference; scripts dev/build/typecheck/test
├── tsconfig.json
├── src/
│   ├── cli.ts              # entry; se TTY → Ink, altrimenti → cli-plain.ts (fallback pipe/CI)
│   ├── cli-plain.ts         # fallback non-TTY: REPL readline (per pipe, CI, no raw mode)
│   ├── config.ts            # provider/modello, API key (env), modo Plan/Build
│   ├── provider.ts          # resolveModel() → LanguageModel (AI SDK)
│   ├── permissions.ts        # allow/ask/deny + pattern + confirmHandler event-driven
│   ├── agent/
│   │   ├── loop.ts          # agent loop: streamText + tools + stopWhen + fullStream
│   │   ├── prompt.ts        # system prompt (dinamico Plan vs Build + env + instructions + skills)
│   │   ├── compaction.ts    # compattazione automatica contesto (summary via LLM)
│   │   └── subagent.ts      # definizioni subagent (explore/general)
│   ├── tools/
│   │   ├── index.ts         # registry (readonlyTools, allTools, toolsForMode)
│   │   ├── registry.ts     # set di tool senza task (rompe circolarità)
│   │   ├── _fs.ts           # resolveInWorkspace (path containment)
│   │   ├── read.ts ls.ts glob.ts grep.ts webfetch.ts    # read-only + web
│   │   ├── write.ts edit.ts bash.ts                      # mutanti (con gate permessi)
│   │   └── task.ts          # subagent tool (explore/general)
│   ├── commands/
│   │   └── index.ts         # registry slash command + dispatch + skill auto-registration
│   ├── context.ts           # caricamento AGENTS.md/CLAUDE.md
│   ├── skills.ts            # skill loader: registry, body, frontmatter, keyword match, bootstrap
│   ├── config-file.ts       # caricamento interference.json (walk up, first-match-wins)
│   ├── permissions.ts       # allow/ask/deny engine + confirmHandler event-driven
│   ├── session/
│   │   ├── store.ts         # persistenza storico sessioni
│   │   └── snapshot.ts      # snapshot file before/after + undo/redo stack
│   └── tui/
│       ├── App.tsx          # root Ink: Static history + streaming + spinner + TextInput + conferme + diff
│       ├── DiffView.tsx     # diff view per edit/write (colori +/-)
│       ├── Message.tsx      # componente messaggio (user/assistant)
│       └── ToolStep.tsx     # componente tool step (call → result)
└── docs/
```

---

## 3. Layer

- **provider** — astrae il `LanguageModel`; cloud (Anthropic/OpenAI) o locale (OpenAI-compatible). Cambiare provider non tocca il loop.
- **agent loop** — `streamText({ model, system, messages, tools, stopWhen: stepCountIs(N) })`; consuma `fullStream` (text-delta + tool-call + tool-result); reinietta gli errori di tool per auto-correzione.
- **tools** — definizione uniforme `tool({ description, inputSchema, execute })`; registry (readonly, all, toolsForMode); ogni I/O passa da `resolveInWorkspace`; 8 tool: read, ls, glob, grep, webfetch, write, edit, bash, task.
- **permessi** — `decide(tool, args) → allow|ask|deny`, valutato nel dispatch; `ask` → conferma con preview; `setConfirmHandler` event-driven; deny list per comandi pericolosi e path segreti.
- **session** — storico persistito (`~/.interference/<hash>/sessions/`); snapshot before/after; undo/redo via `/undo` `/redo`; ripresa con `--continue`.
- **commands** — registry slash command centralizzato; dispatch prima dell'invio all'LLM; skill auto-registrate; comandi: help, clear, init, model, plan/build, undo, redo, compact.
- **skills** — loader da `~/.interference/skills/<name>/SKILL.md`; frontmatter YAML (name, description); keyword match pre-turno; bootstrap automatico.
- **context** — caricamento AGENTS.md/CLAUDE.md (walk up, first-match-wins); instructions custom da `interference.json`; injection nel system prompt.
- **compaction** — compattazione automatica a ~90% contesto; summary via LLM (`generateText`); preserva ultimi 2 turni; soglie per-modello configurate in ProviderDef.
- **config-file** — `interference.json` per-progetto (walk up, first-match-wins); model, mode, permissions, instructions; merge con env vars.
- **subagent** — tool `task` con tipi `explore` (read-only) e `general` (full); contesto isolato; anti-recursion (task non esposto al subagent); risultato XML-wrapped.
- **tui** — Ink: `<Static>` per history, streaming, spinner, TextInput, conferme y/n, diff view per write/edit (+verde, -rosso); fallback non-TTY via `cli-plain.ts`.
- **tui** — Ink: `<Static>` per la history, area dinamica per il turno in streaming, spinner, input; fallback testo se non-TTY.

---

## 4. Flussi

**Turno utente (Build):**
```
input → [slash? gestisci localmente] → agent loop
   streamText(model, messages, tools, stopWhen)
     ├─ text-delta            → render streaming (TUI)
     ├─ tool-call             → SDk chiama execute()
     │     ├─ decide(tool, args) → allow | ask | deny
     │     ├─ ask → setConfirmHandler (event-driven, fuori dal loop)
     │     ├─ execute (path-safe) → tool-result
     │     └─ errore → tool-error reiniettato al modello
     └─ stop (stepCountIs / fine)
```

**Plan vs Build:** stesso loop, set di tool diverso (Plan = solo read-only).

**Modifica file:** prima di `write`/`edit` → snapshot del file → esecuzione → undo disponibile.

---

## 5. Note di sicurezza

- **Path containment**: `resolveInWorkspace` rifiuta path fuori dalla workspace.
- **Permessi in code**: il modello non può aggirarli col prompt; deny-list per azioni distruttive.
- **Edit atomico**: match univoco obbligatorio, altrimenti errore.
- **Bash**: timeout + output troncato + exit code; conferma per default.
- **Segreti**: API key solo da env, mai nel repo.

---

## 6. Note di performance

- Output dei tool **troncato** (read/grep) per non far esplodere il contesto; `read` con offset/limit.
- TUI: history in `<Static>` (non ri-renderizza) → niente flicker su sessioni lunghe.
- Misurare prima di ottimizzare (TTFT, throughput, memoria) — regola `CLAUDE.md` §6.9.
