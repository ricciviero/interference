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
│   │   └── prompt.ts        # system prompt (dinamico Plan vs Build + env + instructions)
│   ├── tools/
│   │   ├── index.ts         # registry (readonlyTools, allTools, toolsForMode)
│   │   ├── _fs.ts           # resolveInWorkspace (path containment)
│   │   ├── read.ts ls.ts glob.ts grep.ts     # read-only
│   │   └── write.ts edit.ts bash.ts          # mutanti (con gate permessi)
│   ├── commands/
│   │   └── index.ts         # registry slash command + dispatch + skill auto-registration
│   ├── context.ts           # caricamento AGENTS.md/CLAUDE.md
│   ├── skills.ts            # skill loader: registry, body, frontmatter, keyword match, bootstrap
│   ├── session/
│   │   ├── store.ts         # persistenza storico sessioni
│   │   └── snapshot.ts      # snapshot file before/after + undo/redo stack
│   └── tui/
│       ├── App.tsx          # root Ink: Static history + streaming + spinner + TextInput + conferme
│       ├── Message.tsx      # componente messaggio (user/assistant)
│       └── ToolStep.tsx     # componente tool step (call → result)
└── docs/
```

---

## 3. Layer

- **provider** — astrae il `LanguageModel`; cloud (Anthropic/OpenAI) o locale (OpenAI-compatible). Cambiare provider non tocca il loop.
- **agent loop** — `streamText({ model, system, messages, tools, stopWhen: stepCountIs(N) })`; consuma `fullStream` (text-delta + tool-call + tool-result); reinietta gli errori di tool per auto-correzione.
- **tools** — definizione uniforme `tool({ description, inputSchema, execute })`; registry che espone set diversi per modo; ogni I/O passa da `resolveInWorkspace`.
- **permessi** — `decide(tool, args) → allow|ask|deny`, valutato nel dispatch (non nel prompt); `ask` → conferma con preview; `setConfirmHandler` event-driven.
- **session** — storico persistito per progetto (`~/.interference/<hash>/sessions/`); snapshot dei file toccati prima delle mutazioni; undo/redo via ripristino snapshot.
- **commands** — registry slash command centralizzato; dispatch prima dell'invio all'LLM; skill auto-registrate come slash command.
- **skills** — loader universale da `~/.interference/skills/<name>/SKILL.md`; keyword match pre-turno; bootstrap automatico.
- **context** — caricamento AGENTS.md/CLAUDE.md da path globali e project tree (walk up, first-match-wins); injection nel system prompt.
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
