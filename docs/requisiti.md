# Requisiti — interference

Specifica funzionale dell'agente. Fonte di verità per lo scope; ogni task di implementazione cita un requisito `RF-*`. Companion di [`architettura.md`](architettura.md).

---

## 1. Obiettivo

**interference** è un **agente di coding da terminale** (stile opencode/Claude Code) in TypeScript + Bun: l'utente conversa con un LLM nel terminale e l'agente svolge task di sviluppo leggendo/scrivendo file ed eseguendo comandi tramite tool, sotto un sistema di permessi.

**Non-obiettivi**: IDE grafico, estensione browser, backend di rete multi-utente, training di modelli.

---

## 2. Moduli e requisiti funzionali

### 2.1 Core / provider — `RF-CORE`
- **RF-CORE-01** — CLI `interference` (Bun, entry `bin`) che avvia una sessione interattiva.
- **RF-CORE-02** — Configurazione: provider/modello, API key (da env), modalità iniziale, parametri.
- **RF-CORE-03** — Astrazione provider via Vercel AI SDK: Anthropic, DeepSeek, GLM (Zhipu), Kimi (Moonshot) cloud + provider **OpenAI-compatible** per modelli locali. Selezione via `INTERFERENCE_PROVIDER`; default progetto **DeepSeek `deepseek-v4-pro`**.
- **RF-CORE-04** — Risposte in **streaming** a terminale.
- **RF-CORE-05** — **Reasoning/thinking abilitato al massimo per ogni provider** (meccanismo per-provider: `reasoningEffort`/`thinking` budget/body `thinking`), reso distinto dalla risposta finale (`reasoning-delta` → blocco dedicato).

### 2.2 Agent loop — `RF-AGT`
- **RF-AGT-01** — Loop tool-calling multi-step: il modello chiama i tool, riceve i risultati, continua fino a una condizione di stop (`stopWhen: stepCountIs`).
- **RF-AGT-02** — Rendering degli step (tool-call + esito) durante l'esecuzione.
- **RF-AGT-03** — Tool-error reiniettato al modello per auto-correzione (niente crash sul singolo errore di tool).
- **RF-AGT-04** — Abort/cancellazione del turno in corso.

### 2.3 Tool — `RF-TOOL`
- **RF-TOOL-01** — Tool sola-lettura: `read` (offset/limit, output troncato), `ls`, `glob`, `grep`.
- **RF-TOOL-02** — Tool mutanti: `write`, `edit` (sostituzione **atomica**, match univoco), `bash` (timeout, output troncato, exit code).
- **RF-TOOL-03** — Tutti i tool risolvono i path **dentro la workspace** (no traversal).
- **RF-TOOL-04** — Schema dei tool con `zod` (`inputSchema`), descrizioni chiare per il modello.

### 2.4 Permessi & modi — `RF-PERM`
- **RF-PERM-01** — Sistema permessi `allow / ask / deny` con pattern, enforce **in code** (non nel prompt).
- **RF-PERM-02** — Conferma interattiva per le azioni `ask`, con preview (diff per edit/write, comando per bash).
- **RF-PERM-03** — Modi **Plan** (solo tool read-only) e **Build** (tutti i tool), commutabili.
- **RF-PERM-04** — Deny di default per azioni pericolose (es. `rm -rf`, scrittura su path di segreti).

### 2.5 TUI — `RF-TUI`
- **RF-TUI-01** — Interfaccia Ink: history immutabile via `<Static>`, area dinamica per lo streaming del turno corrente.
- **RF-TUI-02** — Spinner durante chiamate LLM/tool; input testuale; rendering step tool.
- **RF-TUI-03** — Fallback non-TTY (pipe/CI) in modalità testo.

### 2.6 Sessioni — `RF-SES`
- **RF-SES-01** — Persistenza locale dello storico (per progetto) e ripresa di una sessione.
- **RF-SES-02** — Snapshot dei file prima di ogni mutazione; **undo/redo** che ripristina lo stato.

### 2.7 Comandi & contesto — `RF-CMD`
- **RF-CMD-01** — Slash command gestiti localmente: `/help`, `/clear`, `/undo`, `/redo`, `/mode`, `/model`, `/init`.
- **RF-CMD-02** — `/init` genera/aggiorna `AGENTS.md` analizzando il repo.
- **RF-CMD-03** — Caricamento di `AGENTS.md` nel system prompt (con cap di dimensione).

### 2.8 Skill invocation — `RF-SKILL`
- **RF-SKILL-01** — Skill installate in `~/.interference/skills/<name>/SKILL.md` (formato Agent Skills: frontmatter YAML).
- **RF-SKILL-02** — Invocazione esplicita via `/skill-name`; corpo iniettato nel system prompt.
- **RF-SKILL-03** — Auto-match: keyword matching tra messaggio utente e description della skill (top 3).

### 2.9 Subagent — `RF-SUB`
- **RF-SUB-01** — Tool `task` con tipi `explore` (read-only) e `general` (full).
- **RF-SUB-02** — Subagent con contesto isolato e system prompt dedicato.
- **RF-SUB-03** — Anti-recursion: subagent non può spawnare sub-subagent.

### 2.10 Context compaction — `RF-CMP`
- **RF-CMP-01** — Compattazione automatica a ~90% della finestra di contesto.
- **RF-CMP-02** — Summary via LLM dei turni vecchi, preserva ultimi 2 turni.
- **RF-CMP-03** — Soglie per-modello configurabili (ProviderDef.contextLimit).

### 2.11 Config file — `RF-CFG`
- **RF-CFG-01** — File `interference.json` per progetto (walk up da cwd, first-match-wins).
- **RF-CFG-02** — Schema: model, mode, permissions, instructions.
- **RF-CFG-03** — Env vars sovrascrivono config; permission rules mergiate coi defaults.

### 2.12 Diff TUI — `RF-DIFF`
- **RF-DIFF-01** — Diff view per edit/write nella TUI: + verde, - rosso.
- **RF-DIFF-02** — Fallback testuale con markers +/- nella CLI non-TTY.

### 2.8 Estensione — `RF-EXT`
- **RF-EXT-01** — Provider locale OpenAI-compatible (LM Studio/Ollama/vLLM/MLX) selezionabile.
- **RF-EXT-02** — Subagent: tool `task` che delega un sotto-obiettivo a un agente isolato (contesto/permessi propri, risultato sintetico).

---

## 3. Requisiti non funzionali

- **RNF-01 Sicurezza** — path containment, permessi enforce in code, conferma su azioni distruttive, segreti solo da env.
- **RNF-02 Robustezza** — i tool gestiscono input/edge case senza crash; output troncato per proteggere il contesto.
- **RNF-03 Versioni** — Vercel AI SDK v7 (no API deprecate), Bun 1.3+, Ink 7 (React ≥19.2, Node ≥22).
- **RNF-04 UX terminale** — streaming fluido, errori chiari, uscita pulita; TUI senza flicker su output lungo.
- **RNF-05 Estensibilità** — astrazione provider e registry tool pensati per aggiungere provider/tool senza riscrivere il loop.

---

## 4. Criteri di accettazione (end-to-end)

1. `interference` avvia una chat che risponde in streaming da un LLM.
2. In **Plan**, l'agente esplora il codebase (glob/grep/read) e risponde con citazioni `file:riga`, senza modificare nulla.
3. In **Build**, l'agente crea/modifica file ed esegue comandi con conferma per le azioni `ask`; le azioni `deny` sono bloccate.
4. La TUI Ink mostra streaming + spinner + step tool senza flicker; fallback non-TTY funziona.
5. Undo ripristina una modifica dell'agente; una sessione può essere ripresa.
