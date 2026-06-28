# CLAUDE.md — interference

Guida operativa per coding agent. **interference è un agente di coding da terminale** (stile opencode/Claude Code) costruito in **TypeScript + Bun**: chatti con un LLM nel terminale, l'agente legge/scrive file ed esegue comandi tramite tool, con permessi e modalità Plan/Build.

> Questo file è la **fonte di verità** del progetto. Va tenuto allineato a ogni decisione, modifica o avanzamento (vedi §6.5 — Mantenimento documentazione).

---

## 1. Panoramica

- **Nome progetto**: interference
- **Descrizione**: agente di coding da terminale in TypeScript + Bun. Espone un agent loop tool-calling sopra il **Vercel AI SDK** (provider Anthropic/OpenAI e, in prospettiva, modelli locali OpenAI-compatible), con tool su filesystem e shell, sistema di permessi, modalità **Plan** (sola lettura) e **Build** (accesso pieno), TUI in **Ink**, sessioni con undo/redo.
- **Stack**: **Bun** (runtime + package manager + bundler + test) · **TypeScript** · **Vercel AI SDK v7** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`) · **zod** (schema dei tool) · **Ink 7** (TUI; richiede React ≥19.2, Node ≥22).
- **Riferimenti**: [`docs/requisiti.md`](docs/requisiti.md) · [`docs/architettura.md`](docs/architettura.md) · [`docs/risorse.md`](docs/risorse.md)

---

## 2. Skill globali in uso

Quando il task corrisponde al trigger, **invoca subito la skill** prima di rispondere.

| Trigger | Skill |
|---|---|
| Task sul **layer LLM / agent loop**: Vercel AI SDK, `streamText`/`generateText`, `tool()`+zod, multi-step (`stopWhen`/`stepCountIs`), provider (Anthropic/OpenAI/OpenAI-compatible), structured output, streaming token | `ai-sdk-agents` |
| Task su **runtime/build/test/CLI**: API Bun (`Bun.spawn`/`Bun.$`/`Bun.file`), `bun build`/`bun test`/`bun install`, `package.json` `bin`, `tsconfig`, eseguibile single-file | `bun-typescript` |
| Task sulla **TUI**: Ink (`Box`/`Text`/`useInput`/`render`), `<Static>` per streaming, spinner/input/select, REPL/chat da terminale, alternative (`@clack/prompts`, readline) | `terminal-ui-ink` |
| **Progettazione dell'agente**: agent loop, design dei tool (read/write/edit/bash/glob/grep), permessi/sicurezza, modi Plan/Build, subagent, sessioni/undo, context engineering | `coding-agent-architecture` |
| Lavoro sulla **landing/web UI** (`site/`) o qualunque interfaccia web: costruzione/rifinitura, estetica fedele al brand | `frontend-design` |
| Specifiche **API Claude** quando l'agente usa Anthropic: model-id corretti, pricing, caching, tool-use, limiti | `claude-api` |
| L'utente chiede di committare (`/commit`, "fai commit", "salva le modifiche") | `git-commit` |
| Pianificare un backlog di feature ("crea iterazioni", "/iterations") o un bug ("/fix", "correggi", "regressione") | `iterations-planner` |
| Prima del merge di codice che tocca: **tool su filesystem/shell** (read/write/edit/bash), validazione input, gestione path (containment workspace), segreti/API key | `security-review` |
| Review del diff a caccia di **bug** prima del merge (complementare a `simplify`) | `code-review` |
| Dopo modifiche di codice non banali: ricerca di semplificazioni, riuso, pulizia (qualità, non bug) | `simplify` |

> Skill **built-in** che si attivano da sole quando servono (non serve mapparle): `run` (avvia la CLI/TUI per vederla funzionare), `verify` (verifica che una modifica funzioni davvero nell'app reale).

---

## 3. Skill di progetto

Cartella: `.claude/skills/`

Quando durante lo sviluppo emerge un **pattern ripetibile e specifico di questo progetto** (non già coperto dalle skill globali), **crea o aggiorna** una skill qui. Trigger esplicito + esempi presi dal codice reale, non astratti.

### Skill attive

- **`interference-tool`** — pattern per aggiungere/modificare un tool dell'agente (`src/tools/*`): schema zod, path containment (`resolveInWorkspace`), gate permessi (`decide`/`requestConfirmation` event-driven), troncamento output, registrazione nel registry + system prompt, test. Emersa dalle iterazioni 02/03 (7 tool con la stessa struttura).

Il resto del dominio (agent loop, TUI, Bun/TS) è coperto dalle skill globali `ai-sdk-agents`, `bun-typescript`, `terminal-ui-ink`, `coding-agent-architecture`. Crea altre skill di progetto solo se emerge un pattern **specifico di interference** non coperto (≥2 occorrenze).

---

## 4. Decision log

Cartella: `.claude/decisions/`

Registro delle **decisioni architetturali e tecniche non banali** (formato ADR semplificato).

1. **Solo on-demand**. Scrivi un file **solo** se l'utente lo chiede esplicitamente ("registra questa decisione", "salva un ADR").
2. **Mai proattivo**. Non proporlo tu.
3. **Filtro qualità**. Solo decisioni con contesto + alternative + conseguenze. Se banale, dillo e non creare il file.
4. **Lettura passiva**. Di fronte a una scelta simile a una registrata, consulta e cita l'ADR esistente.
5. **Naming**: `YYYY-MM-DD-slug-kebab.md`. **Stato** nel frontmatter (`accepted` / `superseded-by-…` / `deprecated`). Template in `.claude/decisions/README.md`.

---

## 5. Memoria di progetto

Cartella: `.claude/memory/`

Registro di **fatti vivi non-decisionali** (stato di integrazioni, env, gotcha, patch locali). Diverso dalle decisioni: la memoria racconta *qual è lo stato oggi*.

1. **Lettura proattiva**: prima di toccare un dominio coperto da un memo, leggilo.
2. **Scrittura on-demand/consensuale**: l'utente dice "ricorda che…", o noti uno stato non deducibile dal codice e l'utente conferma.
3. **Aggiornamento attivo**: quando lo stato cambia, aggiorna o rimuovi il memo nello stesso intervento.
4. **Formato**: `.md` brevi per topic; ultima riga `_aggiornato: YYYY-MM-DD_`. Template in `.claude/memory/README.md`.

---

## 6. Regole non negoziabili

1. **Allineamento ai requisiti** — ogni task parte da un requisito di `docs/`. Se manca un requisito chiaro, **fermati e chiedi**.

2. **Tracciabilità nel codice** — quando utile, annota il riferimento al requisito (es. `// RF-AGT-02`). Non spammare commenti.

3. **Codice sempre allineato al doc** — se emerge una discrepanza requisito↔codice, **aggiorna prima il documento**, poi scrivi il codice.

4. **Skill da invocare per dominio** — usa la tabella §2. Se un task tocca più domini (es. agent loop + TUI), separa il flusso e invoca la skill giusta in ogni fase.

5. **Mantenimento documentazione (regola unificata)** — ogni decisione importante, modifica strutturale o avanzamento si propaga **nello stesso intervento** su: `CLAUDE.md`, `.claude/skills/*`, `.claude/memory/*` (se lo stato cambia), `docs/`, `README.md`.

   | Cambiamento | CLAUDE.md | skills | memory | docs | README |
   |---|:-:|:-:|:-:|:-:|:-:|
   | Cambio stack/convenzione | ✅ | — | — | ✅ | ✅ se cambia setup |
   | Cambio struttura/naming | ✅ | — | — | ✅ | — |
   | Pattern ripetibile emerso | ✅ §3 | ✅ crea/aggiorna | — | — | — |
   | Avanzamento (modulo completato) | ✅ snapshot | — | — | ✅ se piano | — |
   | Cambio stato integrazione/env | — | — | ✅ memo | — | — |
   | Discrepanza requisiti↔codice | — | — | — | ✅ **prima** | — |
   | Correzione info errata | ✅ | ✅ | ✅ | ✅ | ✅ |

   > Il decision log (`.claude/decisions/`) **non** rientra qui: solo on-demand (§4).

   **Se chiudendo un task uno di questi documenti è ora bugiardo o incompleto, il task non è finito.**

   **Dopo ogni commit + push**: verificare CLAUDE.md, docs/, `.claude/memory/`, `.claude/skills/` e README. Se il commit ha cambiato struttura, stack, convenzioni, stato o ha completato un'iterazione, aggiornare i documenti impattati nello stesso intervento. Un commit senza documentazione allineata è un commit incompleto.

6. **Propagazione dei fix (no fix monco)** — quando correggi un bug, **prima di chiudere fai grep del pattern errato** nell'intero modulo e correggi **tutti** i punti. Una correzione monca = il prossimo path esplode. Dopo il fix, mostra i punti controllati.

7. **Skill di progetto auto-alimentate** — se un pattern si ripete (≥2 volte) e non è banale né coperto dalle globali, crea/aggiorna `.claude/skills/{nome}.md` nello stesso intervento.

8. **Completezza e auto-verifica (graduata per dimensione)** — "completato" si **dimostra**, non si dichiara. Il rigore scala: *microtask* → verifica mentale; *media* (1 feature, 1 layer) → ripassa i percorsi non-felici e chiudi con 2-3 righe di verifica; *grande/iterazione* (≥2 layer + feature osservabile, o iterazione di `iterations-planner`, o requisiti soft "completo/curato", o richiesta di doppio check) → **pass di completezza con loop**:
   - Cambia cappello (da chi costruisce a chi *usa e attacca*) e rileggi attraverso le **lenti**:
     - **TUI/UX**: empty · loading · errore con messaggi chiari (non stack trace) · feedback/success · conferma su azioni distruttive · stati disabled/permessi · uscita pulita (Ctrl+C)
     - **Agent/BE**: validazione input dei tool · errori gestiti · edge case (file assente, match ambiguo, output enorme, timeout) · path containment · loop con stop pulito · tool-error reiniettato (auto-correzione)
     - **Ciclo del dato (write→read)**: ciò che si **scrive/persiste** (sessione, snapshot, AGENTS.md) ha un percorso per essere **riletto**
     - **Flusso E2E (eseguito, non solo letto)**: gira lo scenario reale (per una CLI/TUI: un giro del percorso pubblico). ⚠️ La TUI va collaudata in **terminale reale**, non solo via lettura del codice; se non possibile, dichiaralo.
   - Ogni buco → un'escalation da chiudere; **ripeti il pass** finché un giro esce a secco (max ~2 giri; al 3° con buchi → la task è cresciuta, spezzala).
   - **Report finale** `requisito → stato → evidenza` (`file:riga`/test/output). Un requisito senza evidenza è **non fatto**. Se una voce è ⚠️/❌, **non** dichiarare completato.

9. **Misura prima di ottimizzare** — niente ottimizzazioni speculative; profila, trova l'hotspot, ottimizza, rimisura.

10. **Sicurezza dell'agente** — i tool che scrivono/eseguono sono superficie di rischio: **path containment** nella workspace, **permessi enforce in code** (non delegati al prompt), conferma per azioni distruttive, segreti/API key solo da env (mai nel repo). Vedi skill `coding-agent-architecture` e `security-review`.

11. **Riferimento opencode (e OSS simili)** — interference replica le funzionalità di un coding agent maturo. Quando implementi una **feature specifica e non banale** (agent loop, gestione tool, permessi/conferma, sessioni, compaction, parsing, ecc.), **prima** consulta come la risolve **opencode** (open source, MIT — `sst/opencode`) ed eventualmente `aider`/`Claude Code`: spesso il pattern provato evita bug sottili (es. il deadlock della conferma è stato risolto adottando l'approccio event-driven di opencode). Regole: **adatta il pattern, non copiare codice verbatim** (rispetta la licenza MIT: niente copia-incolla di porzioni sostanziali senza attribuzione); **cita la fonte** (file/URL) nel commit o nel `plan.md`; verifica che sia attuale (questi repo evolvono). È un riferimento, non un vincolo: se hai una soluzione migliore e verificata, usala.

---

## 7. Snapshot stato

> Aggiornato al 2026-06-29. Tieni allineata questa sezione a ogni avanzamento (regola §6.5).

- 🟢 `CLAUDE.md` creato (questo file)
- 🟢 `.claude/skills/`, `.claude/decisions/`, `.claude/memory/` con `README.md`
- 🟢 `docs/requisiti.md`, `docs/architettura.md`, `docs/risorse.md`
- 🟢 4 skill globali di dominio: `ai-sdk-agents`, `bun-typescript`, `terminal-ui-ink`, `coding-agent-architecture`
- 🟢 Backlog in `iterazioni/` (8 iterazioni) — vedi §9
- 🟢 `logo/` (brand) e `LICENSE` (MIT) presenti
- 🟢 **Iterazione 01 (scaffold-core)** completata: progetto Bun+TS, `package.json`/`tsconfig`, `src/{config,provider,cli}` + `src/agent/{loop,prompt}`. `bun install` + `tsc --noEmit` puliti. **Streaming reale verificato**.
- 🟢 **Multi-provider + reasoning** (oltre il piano): `INTERFERENCE_PROVIDER` = `anthropic` | `deepseek` | `glm` | `kimi`. Anthropic via `@ai-sdk/anthropic`, DeepSeek via `@ai-sdk/deepseek`, GLM/Kimi via `@ai-sdk/openai-compatible`. **Default progetto: DeepSeek `deepseek-v4-pro` con ragionamento MAX.** Thinking abilitato al massimo per ogni provider (deepseek `reasoningEffort:max`; anthropic `thinking` budget; glm/kimi `thinking` via `transformRequestBody`); reasoning reso distinto (blocco `┄ thinking`). Override modello con `INTERFERENCE_MODEL`. Key in `.env` (gitignored): `{ANTHROPIC,DEEPSEEK,GLM,KIMI}_API_KEY`. Provider **locale** = it. 07 (stessa astrazione). Verificato live: deepseek/anthropic/glm; kimi cablato (account senza credito).
- 🟢 **Iterazione 02 (tool-system-readonly)** completata: 4 tool sola-lettura (`read`, `ls`, `glob`, `grep`) con path safety (`resolveInWorkspace`), output troncato (30k cap), loop multi-step con `stopWhen: stepCountIs(20)`, rendering tool-call/result nella CLI. Modalità **Plan** funzionante: l'agente esplora il codebase con grep/glob/read in catena e risponde con `file:riga`. Tool-error reiniettati (auto-correzione). `tsc --noEmit` pulito. **E2E verificato live** con DeepSeek. `glob` esclude `node_modules`/`.git`.
- 🟢 **Iterazione 03 (mutating-tools-permessi)** completata: 3 tool mutanti (`write`, `edit`, `bash`) con enforce permessi `allow/ask/deny` a pattern glob (first-match-wins, custom rules sovrascrivono defaults), deny list per comandi pericolosi (`rm -rf`, `sudo`, `curl pipe`, `git push --force`) e path segreti (`.env`, `.pem`, `.key`, `secrets/**`). **Edit atomico**: match univoco obbligatorio, `replaceAll` esplicito. **Bash sicuro**: timeout 120s, output cap 30k, exit code. **Modi Plan/Build**: `/plan` `/build` commutabili, Plan espone solo tool read-only. Conferma interattiva `[y/N]` con preview per azioni `ask`. Enforcement in `execute`, fuori dal prompt. 58 test tutti pass. **Conferma resa event-driven** (`setConfirmHandler`): il vecchio approccio (loop che osservava lo stream) andava in **deadlock** in Build → corretto e verificato con driver E2E (write+`y`→file creato). Vedi `.claude/memory/confirmation-flow.md`.
- 🟢 **Iterazione 04 (tui-ink)** completata: TUI Ink 7.1 + React 19.2. `<Static>` per history immutabile, streaming dinamico del turno corrente, spinner `@inkjs/ui`, `TextInput` per input. Conferme permessi integrate via `useInput` y/n (`setConfirmHandler` event-driven). Fallback non-TTY: `cli-plain.ts` readline. JSX in tsconfig. Typecheck e 58 test tutti pass.
- 🟢 **Iterazione 05 (sessioni-persistenza)** completata: storico sessioni persistito localmente in `~/.interference/<hash>/sessions/*.json`, ripresa via `--continue` o `--continue <id>`. Snapshot before/after dei file toccati pre-write/edit, undo/redo via `/undo` `/redo` (CLI+TUI). `finalizeSnapshots()` cattura after-state a fine turno. Retention automatica (cleanup). 11 nuovi test, 69 totali pass.
- 🟢 **Iterazione 06 (comandi-e-contesto)** completata: registry slash command centralizzato (`/help`, `/clear`, `/undo`, `/redo`, `/init`, `/model`, `/plan`, `/build`). `/init` delega all'agente (template LLM analizza project → scrive AGENTS.md). Caricamento AGENTS.md/CLAUDE.md nel system prompt (walk up da cwd, first-match-wins). System prompt con `<environment>` e `<instructions>` blocks. Pattern adottati da opencode (command registry, instruction loading). 69 test, typecheck pulito.
- 🟢 **Iterazione 07 (skill-invocation)** completata: 38 skill in `~/.interference/skills/` (copiate da `.claude/skills/`). Invocazione **esplicita** (`/skill-name` carica SKILL.md e lo inietta via `<skill_context>` nel system prompt) e **automatica** (keyword match pre-turno: tokenizza messaggio utente, matcha description, top 3). Skill auto-registrate come slash command. Bootstrap di 3 skill interne (agents-setup, iterations-planner, interference-tool). `prompt.ts` delegato a `skills.ts` come modulo unico. 69 test, typecheck pulito.
- 🟢 **Iterazione 09 (subagent)** completata: tool `task` con tipi `explore` (solo tool read-only) e `general` (tutti i tool). Subagent gira con contesto isolato e system prompt dedicato. Anti-recursion: subagent non può spawnare sub-subagent (`task` non esposto). Risultato XML-wrapped. Circolare `tools/index.ts` → `task.ts` → `subagent.ts` risolto con `tools/registry.ts` separato. 69 test, typecheck pulito.
- 🟢 **Iterazione 10 (compaction)** completata: compattazione automatica a ~90% del contesto. Stima token (chars/3.5), soglie per-modello (DeepSeek 1M, Claude 200K, default 128K). Summary via `generateText`, preservati ultimi 2 turni. Trigger automatico a fine turno in CLI e TUI, comando `/compact`. 69 test, typecheck pulito.
- 🟢 **Iterazione 11 (config-file)** completata: file `interference.json` per progetto (walk up da cwd, first-match-wins). Schema: `model`, `mode`, `permissions` (allow/ask/deny con pattern), `instructions`. Env vars sovrascrivono config. Permission rules mergiate coi defaults. `PermRule` type esportato. 69 test, typecheck pulito.
- 🟢 **Iterazione 12 (diff-tui)** completata: diff view nella TUI per edit/write. Algoritmo line-based diff, colori (+ verde, - rosso) in TUI, markers +/- in CLI plain. Write mostra contenuto come linee aggiunte, edit mostra oldString→newString. 69 test, typecheck pulito.

---

## 8. Cosa **non** fare

- ❌ Implementare feature non documentate senza prima aggiornare i documenti (§6.5)
- ❌ Saltare la skill di dominio quando il trigger combacia (§2)
- ❌ Lasciare disallineamenti tra codice e documenti
- ❌ Tool che leggono/scrivono fuori dalla workspace, o permessi aggirabili dal prompt (§6.10)
- ❌ `edit` non atomico (match ambiguo) o `bash` distruttivo senza conferma
- ❌ Segreti/API key nel repo
- ❌ Usare API AI SDK deprecate (`maxSteps`, tool `parameters`) — usa `stopWhen: stepCountIs`, `inputSchema` (skill `ai-sdk-agents`)
- ❌ Dichiarare una task grande "completata" senza pass di completezza + report `requisito → evidenza` (§6.8)
- ❌ Proporre proattivamente un ADR (§4)

---

## 9. Iterazioni in coda

Le feature del progetto sono organizzate come **iterazioni** in [`iterazioni/`](iterazioni/). Ogni iterazione è una sotto-cartella con `task.md` (cosa + DoD + pass di completezza) e `plan.md` (come: decisioni, step, file).

> 📁 La cartella `iterazioni/` è **locale, non versionata** (vedi `.gitignore`). Se non è presente sulla tua macchina, rigenerala con `iterations-planner`.

**Indice** (ordine di esecuzione; le fondamenta precedono ciò che le consuma):

*Fase 1 — Nucleo agentico*
1. `01-scaffold-core/` — progetto Bun+TS, config, provider AI SDK+Anthropic, agent loop minimo + streaming
2. `02-tool-system-readonly/` — tool read/ls/glob/grep + loop multi-step (`stopWhen`) = modalità Plan
3. `03-mutating-tools-permessi/` — write/edit/bash + permessi allow/ask/deny + modi Plan/Build

*Fase 2 — UX agente*
4. `04-tui-ink/` — TUI Ink (streaming `<Static>`, spinner, input, history)
5. `05-sessioni-persistenza/` — storico + undo/redo via snapshot
6. `06-comandi-e-contesto/` — slash command (/init, /undo, /mode, /model) + AGENTS.md + system prompt

*Fase 3 — Estensione*
7. `07-skill-invocation/` — invocazione skill esplicita (/skill-name) + auto-match (keyword su description)
8. `08-provider-locale/` — provider OpenAI-compatible per modelli locali **(skippata, non necessaria)**
9. `09-subagent/` — delega task a subagent isolato

*Fase 4 — Robustezza e UX*
10. `10-compaction/` — compattazione automatica del contesto (riassumi turni vecchi, preserva recenti)
11. `11-config-file/` — file `interference.json` per progetto (model, permessi, mode, instructions)
12. `12-diff-tui/` — diff view nella TUI per edit/write (mostra cosa è cambiato)

**Workflow**: leggi `task.md` poi `plan.md` → se serve aggiorna `plan.md` prima del codice → implementa → **pass di completezza** (§6.8) → aggiorna `CLAUDE.md`/`docs/` se cambia architettura → stato `task.md` a 🟢.

<!-- Sezione "Fix in coda" gestita da `iterations-planner` al primo bug non banale (cartella `fix/`). -->
