# CLAUDE.md — Interference

Guida operativa per coding agent. **Toolkit Python da terminale per LLM locali da coding su Apple Silicon.** Scopre modelli su Hugging Face, ne valuta la fattibilità sulla *macchina target*, li scarica **solo su SSD esterno**, e li espone via **server OpenAI-compatible (MLX)** a un client di coding da terminale (**opencode**). Nessun cloud nel path di inferenza: tutto in locale.

> Questo file è la **fonte di verità** del progetto. Va tenuto allineato a ogni decisione, modifica o avanzamento (vedi §5.5 — Mantenimento documentazione).

> **Pivot 2026-06-28**: il progetto è stato rifondato (di nuovo). La precedente direzione (motore di inferenza Rust da zero + IDE Tauri per la scrittura di paper LaTeX) è **abbandonata**. Lo scope è ora un toolkit Python: *scout → manager → orchestratore* per usare modelli locali da coding stile Claude Code, da terminale.
>
> **Pivot precedente 2026-06-04** (storico): da NestJS/Angular/Electron/Cursor SDK a engine Rust + Tauri. Anch'esso superato.
>
> ⚠️ Il repo **non è sotto git**: la storia dei pivot precedenti non è recuperabile da `git log`. Lo scaffold Rust legacy (`crates/`, `Cargo.*`, `.cargo/`, `target/`) e le vecchie `iterazioni/` sono stati **rimossi** il 2026-06-28; i `docs/` sono stati riscritti per il nuovo scope.

---

## 1. Panoramica

- **Nome progetto**: Interference
- **Cosa è**: una **CLI Python** che (1) cerca e *studia* modelli LLM da coding su Hugging Face, (2) calcola quali girano davvero sulla macchina target e li marca ✅/⚠️/❌, (3) scarica quelli scelti **esclusivamente sull'SSD esterno**, (4) li serve con un **orchestratore OpenAI-compatible basato su MLX** con **hot-swap multi-modello**, così da usarli da terminale con **opencode** (esperienza stile Claude Code).
- **Cosa NON è**: non è un motore di inferenza scritto da zero (si appoggia a **MLX/`mlx-lm`**); non è un IDE; non ha frontend grafico; non scrive paper LaTeX; non usa Rust, Tauri, NestJS, Docker, database server, né cloud.
- **Scope funzionale minimo**: (1) **scout** HF + fit-check, (2) **manager** download su SSD con enforcement della regola d'oro, (3) **orchestratore** OpenAI-compatible con hot-swap, (4) **glue opencode** (genera la config del provider locale).
- **Riferimenti**:
  - [`docs/requisiti.md`](docs/requisiti.md) — specifica funzionale (scope, moduli, requisiti RF)
  - [`docs/architettura.md`](docs/architettura.md) — architettura tecnica (CLI, moduli, flussi, runtime)
  - [`docs/risorse.md`](docs/risorse.md) — link esterni verificati

### Macchina target (vincolo permanente)

| Risorsa | Valore | Implicazione |
|---|---|---|
| Modello | MacBook Pro **M1 Pro** | GPU Metal via MLX (Apple-native) |
| RAM unificata | **32 GB** | **vero collo di bottiglia**: budget reale per modello + KV cache ≈ **20–22 GB** (resto a macOS/app) |
| SSD interno | 512 GB | **off-limits per i modelli** (regola d'oro) |
| SSD esterno | **1.5 TB liberi** (Thunderbolt) | **unica** destinazione dei modelli; impatta solo il *load time*, non la velocità di inferenza a modello residente |

> **Regola d'oro**: NESSUN modello deve stare sul Mac. Tutti sull'SSD esterno. Enforcement via `HF_HOME`/config puntati all'SSD + guard che **rifiuta** path interni.

### Decisioni di fondo (confermate dall'utente il 2026-06-28)

| Tema | Decisione |
|---|---|
| Linguaggio/stack | **Python 3.12 + `uv`**. Niente Rust (i binding MLX Rust sono acerbi; l'ecosistema utile è Python). |
| Runtime di inferenza | **MLX + `mlx-lm`** (Apple-native, più veloce su M-series, server OpenAI-compatible incluso). Si **riusa**, non si riscrive. |
| Storage modelli | **Solo SSD esterno**, config-driven (`HF_HOME`/var dedicata). Guard di avvio rifiuta path interni. |
| Client di coding | **opencode** (parla OpenAI-compatible nativamente → zero proxy). |
| Scout | **Catalogo HF + auto-filtro**: fit-check `RAM ≈ pesi_quant + KV_cache(ctx, layer, kv_head)` vs macchina target. Nessun download per valutare. |
| Orchestratore | **Hot-swap multi-modello** da subito: un modello in RAM, cambio on-demand (veloce vs forte) con routing. |
| CLI | Comando unico `interference` con sottocomandi (`scout`, `pull`, `serve`, `opencode-config`, …). |

### Modelli candidati (la shortlist la conferma lo scout con i numeri reali)

- **Qwen3-Coder-30B-A3B** (MoE, ~3B attivi → veloce a parità di qualità)
- **Qwen2.5-Coder-32B** Q4 (~19 GB, tirato sui 32 GB, contesto contenuto)
- **Qwen2.5/3-Coder-14B** Q4 (~9 GB, comodo, contesto lungo)
- **Qwen2.5-Coder-7B** Q4/Q8 (leggero, autocomplete veloce)

---

## 2. Skill globali in uso

Quando il task corrisponde al trigger, **invoca subito la skill** prima di rispondere.

| Trigger | Skill |
|---|---|
| Task sul **layer HTTP dell'orchestratore** (`interference/orchestrator/server.py`): endpoint FastAPI OpenAI-compatible, uvicorn, modelli Pydantic. Trigger **stretto** al wrapper HTTP — non per scout/manager/CLI. | `fastapi-backend` |
| Quando l'utente chiede di committare (`/commit`, "fai commit", "salva queste modifiche") — **prima** va inizializzato git (vedi §7) | `git-commit` |
| Pianificare il backlog in `iterazioni/` (task + plan per ogni feature) o un fix (`/fix`) | `iterations-planner` |
| Prima del merge/della messa in produzione di codice che tocca: parsing di metadati/file scaricati da HF, validazione input, gestione path/filesystem (enforcement SSD), segreti/token HF | `security-review` |
| Hardening dell'ambiente **solo se** l'orchestratore viene esposto oltre `localhost` (oggi è localhost-only) | `server-hardening` |
| Ricerche multi-fonte ampie su modelli/tecniche che vanno **oltre** il fetch dello scout (es. confronto architetture, stato dell'arte quantizzazioni) | `deep-research` |

> **Non c'è una skill globale dedicata a Python "puro"** nell'elenco disponibile: `fastapi-backend` copre solo il layer HTTP dell'orchestratore. La maggioranza del codice (scout, manager, fit-check, CLI Typer/`huggingface_hub`/pydantic) è coperta da questo file e dai `docs/`. Se il pattern Python si consolida, valutare una skill **di progetto** (§3).
> Le skill di stack non pertinenti (UI: `ui-ux-pro-max`/`taste-skill`/`frontend-design`/`shadcn`/`nextjs`/`angular`/`react-native`/`swiftui*`; backend: `rust-engineer`/`nestjs`/`spring-boot`/`dotnet`; deploy: `aws`/`vps-github-autodeploy`/`telegram-deploy-notify`; `feature-flags`, `melix-llm-lab`) **non vanno invocate**.
> **Docker**: non adottato — vedi §2.1.

### 2.1 Docker — non adottato (deciso 2026-06-28)

**Decisione: niente Docker.** Il progetto resta **nativo** con `uv`. Motivazioni:

- ⚠️ **MLX/Metal non funziona in Docker su macOS**: Docker Desktop gira in una VM Linux senza accesso alla GPU Metal. L'**orchestratore di inferenza** (il cuore MLX) — l'unica parte che avrebbe senso isolare — **non è containerizzabile** sul Mac.
- Le parti non-GPU (scout/manager) sono un **CLI single-user** che scrive sull'SSD esterno: containerizzarle aggiunge bind-mount, networking ed env per **valore nullo**.
- La **riproducibilità** è già coperta da `uv` (Python pinnato + `uv.lock`).
- Progetto **solo locale**: nessun target di produzione → nessun bisogno di immagini/deploy.

Quindi `docker-environments` **non è mappata** in §2 e non si creano Dockerfile/compose. Riaprire solo se cambia lo scope (es. un layer di servizio non-GPU che giustifichi l'isolamento).

---

## 3. Skill di progetto

Cartella: `.claude/skills/`

Quando emerge un **pattern ripetibile e specifico** (≥2 occorrenze), **crea o aggiorna** una skill qui, con trigger esplicito ed esempi dal codice reale.

### Stato attuale: nessuna skill di progetto

Le skill della fase Rust/engine e di quella precedente sono state rimosse perché legate a stack abbandonati.

### Candidate future (da creare on-demand, quando il codice esisterà)

- **`hf-fit-check`** — calcolo della fattibilità di un modello sulla macchina target (stima RAM pesi+KV cache da `config.json`, mapping quantizzazione→byte/peso, soglie ✅/⚠️/❌). Quando il modulo `scout` si stabilizza.
- **`ssd-enforcement`** — pattern di guard che garantisce che ogni scrittura/lettura modelli avvenga sull'SSD esterno (risoluzione path, rifiuto path interni, gestione SSD non montato). Quando il modulo `manager` esiste.
- **`mlx-hotswap-server`** — wrapper orchestratore OpenAI-compatible su `mlx-lm` con caricamento/scaricamento modelli e routing. Quando l'orchestratore esiste.
- **`opencode-local-provider`** — generazione/aggiornamento della config opencode per puntare al provider locale. Quando la glue esiste.

---

## 4. Decision log

Cartella: `.claude/decisions/`

Registro delle **decisioni architetturali non banali** (ADR semplificato). **Solo on-demand**: scrivi un file *solo* se l'utente lo chiede esplicitamente. Mai proattivo. Naming `YYYY-MM-DD-slug.md`, stato nel frontmatter. Template in `.claude/decisions/README.md`.

> Il pivot del 2026-06-28 sarebbe un candidato ADR forte, ma **non lo creo proattivamente**: aspetto richiesta esplicita.

### 4.1 Memoria di progetto

Cartella: `.claude/memory/` (versionata nel repo). Registro di **stati vivi non-decisionali** (integrazioni dormienti, env da impostare, gotcha, skeleton da rifinire). **Prima** di toccare un dominio coperto da un memo, leggilo; quando lo stato cambia, **aggiorna o rimuovi** il memo nello stesso intervento. Memo attivi: `ssd-path-status.md`, `orchestrator-status.md`. Vedi `.claude/memory/README.md`.

---

## 5. Regole non negoziabili

1. **Regola d'oro — modelli solo su SSD esterno.** Nessun byte di peso modello sul disco interno del Mac. Ogni download e ogni caricamento passa da path sull'SSD esterno, verificati da un guard. Se l'SSD non è montato, l'operazione **fallisce con messaggio chiaro**, non ripiega sul disco interno.

2. **Vincolo macchina sempre presente.** Ogni valutazione di un modello tiene conto di M1 Pro / 32 GB RAM. Il fattore limitante è la **RAM** (pesi + KV cache), non lo spazio SSD. Lo scout non propone mai modelli che non rientrano nel budget reale.

3. **Privacy locale.** Nessun dato dell'utente (codice, prompt) lascia la macchina. Niente telemetria, niente cloud nel path di inferenza. Le uniche chiamate di rete ammesse sono: API Hugging Face (ricerca/metadati/download modelli) e l'eventuale download del client opencode. Il token HF, se usato, sta in keychain/env, mai nel repo.

4. **Allineamento ai requisiti.** Ogni task parte da un requisito di `docs/requisiti.md` o da `docs/architettura.md`. Se manca un requisito chiaro, **fermati e chiedi**.

5. **Mantenimento documentazione (regola unificata)** — qualsiasi decisione importante, modifica strutturale o avanzamento si propaga **nello stesso intervento** su:
   1. `CLAUDE.md` (questo file)
   2. `.claude/skills/*.md`
   3. `docs/requisiti.md`, `docs/architettura.md`, `docs/risorse.md`

   | Cambiamento | CLAUDE.md | skills | docs |
   |---|:-:|:-:|:-:|
   | Cambio stack o convenzione | ✅ | — | ✅ |
   | Cambio struttura moduli / naming | ✅ | — | ✅ |
   | Pattern ripetibile emerso | ✅ §3 | ✅ crea/aggiorna | — |
   | Skill custom obsoleta | ✅ rimuovi | ✅ elimina | — |
   | Avanzamento (milestone completata) | ✅ snapshot | — | ✅ se piano |
   | Discrepanza requisiti ↔ codice | — | — | ✅ aggiorna **prima** |
   | Correzione info errata | ✅ | ✅ | ✅ |

   **Se chiudendo un task uno di questi documenti è ora bugiardo o incompleto, il task non è finito.**

6. **Misura prima di ottimizzare.** Per scelte di runtime/modelli, ogni "ottimizzazione" senza metriche (TTFT, tokens/sec, RAM di picco, load time da SSD) è speculativa e vietata. Misura, trova l'hotspot vero, ottimizza, rimisura.

7. **Robustezza sull'input esterno.** I metadati HF e i file scaricati sono **superficie d'attacco/errore**: validare sempre (`config.json` mancante o malformato, dimensioni dichiarate vs reali, path traversal nei nomi file). Niente `assert` come validazione di runtime; errori espliciti e gestiti.

8. **Niente segreti nel repo.** Token HF e config sensibili fuori dal versioning (`.gitignore`), in env/keychain.

---

## 6. Snapshot stato

> Aggiornato al 2026-06-28. Tieni allineata questa sezione a ogni avanzamento (regola §5.5).

- 🟢 Pivot deciso (runtime MLX, client opencode, repo riusata, scout catalogo+filtro, hot-swap multi-modello, stack Python+uv)
- 🟢 `CLAUDE.md` riscritto per il nuovo scope
- 🟢 `docs/requisiti.md`, `docs/architettura.md`, `docs/risorse.md` riscritti per il nuovo scope
- 🟢 Scaffold CLI Python: `pyproject.toml` (uv, extra `serve`), package `interference/`, `README.md`, `.env.example`/`.gitignore` rifatti. `uv sync` OK, CLI gira.
- 🟢 Modulo `scout` (`search`/`metadata`/`fit`) — **funzionante end-to-end** su HF; fit-check stima i pesi dalla dimensione reale su disco + KV cache → verdetto ✅/⚠️/❌. Validato con `scout "Qwen2.5-Coder"`.
- 🟢 Modulo `manager` (`storage`/`download`/`registry`) — guard regola d'oro **testato** (rifiuta path interni e SSD assente). `pull`/`list`/`rm` cablati (download non testato senza SSD montato).
- 🟡 Orchestratore (`pool`/`server`/`routing`) — skeleton funzionante (FastAPI + hot-swap LRU, OpenAI-compatible), MLX importato lazy. **Da rifinire**: streaming token, routing config-driven, test con modello reale. Richiede `uv sync --extra serve`.
- 🟡 Glue `opencode` (`glue/opencode.py`) — genera config provider locale; smoke test end-to-end (RF-OC-03) da implementare.
- 🟢 **Legacy rimosso** (2026-06-28): cancellati `crates/`, `Cargo.*`, `rust-toolchain.toml`, `.cargo/`, `target/`, `iterazioni/` 01–18. Root ora pulita (solo progetto Python + `docs/` + `.claude/` + `logo/`).
- 🟢 `.claude/` allineato al pivot: `skills/README.md` riscritto (candidate Python), `decisions/README.md` ok, **`memory/` creata** (README + memo `ssd-path-status`, `orchestrator-status`).
- 🟢 `logo/` — assets del brand (riusabili)

---

## 7. Cosa **non** fare

- ❌ Scaricare o caricare un modello sul disco interno del Mac, per qualsiasi motivo (regola d'oro)
- ❌ Proporre/scaricare modelli che non rientrano nel budget RAM reale della macchina target
- ❌ Introdurre cloud o telemetria nel path di inferenza
- ❌ Mettere il token HF o segreti nel repo
- ❌ Implementare feature non documentate senza prima aggiornare i docs (§5.5)
- ❌ Reintrodurre pezzi dei vecchi stack (Rust/Tauri, NestJS/Angular/Electron, Docker, Postgres) senza decisione esplicita
- ❌ Operazioni distruttive (rm, overwrite massivi) senza conferma esplicita — il repo **non è sotto git**, non c'è undo
- ❌ Ottimizzare senza una baseline misurata
- ❌ Proporre proattivamente un ADR (§4)
- ❌ Lavorare su più moduli contemporaneamente senza chiudere il precedente

---

## 8. Roadmap

> Le vecchie iterazioni 01–18 (piano engine) sono state **rimosse**. Il backlog del nuovo scope è in `iterazioni/` (cartella locale, non versionata — rigenerabile con `iterations-planner`).

Roadmap logica completa (le fondamenta precedono ciò che le consuma):

1. **Scaffold CLI** — 🟢 fatto
2. **Scout** — 🟢 fatto (ricerca HF + fit-check RAM, ✅/⚠️/❌)
3. **Manager (guard)** — 🟢 guard regola d'oro testato (download robusto = it. 03)
4. **Orchestratore** — server OpenAI-compatible `mlx-lm` + hot-swap + routing → it. **01**
5. **Glue opencode** — config provider + smoke test E2E → it. **02**
6. **Rifinitura** — download robusto (it. 03), benchmark + packaging (it. 04)

**Backlog attivo** (`iterazioni/`, parte dallo step 4 — gli step 1–3 sono già fatti):

1. `01-orchestratore-mlx-hotswap/` — streaming token, routing config-driven, test modello reale
2. `02-glue-opencode-e2e/` — config provider opencode + smoke test end-to-end (dipende da 01)
3. `03-manager-download-robusto/` — resume, verifica integrità, validazione file (RF-MGR-03/06)
4. `04-bench-e-packaging/` — micro-benchmark (TTFT, t/s, RAM picco) + installer CLI (dipende da 01)

**Workflow per iterazione**: leggi `task.md` poi `plan.md` → (se serve) aggiorna `plan.md`/`docs/` **prima** del codice → implementa → **pass di completezza** (sezione nel `task.md`) → aggiorna `CLAUDE.md`/`docs/` se cambia architettura → stato a 🟢. Per (ri)generare: skill `iterations-planner`.
