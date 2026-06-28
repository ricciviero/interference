# Requisiti — Interference

Specifica funzionale del toolkit. Fonte di verità per lo scope; ogni task di implementazione cita un requisito `RF-*`.

> Pivot 2026-06-28: documento riscritto per il nuovo scope (toolkit Python per LLM locali da coding). Vedi `CLAUDE.md` §1.

---

## 1. Obiettivo

Permettere all'utente di **scoprire, valutare, scaricare ed eseguire in locale** modelli LLM da coding, usabili da terminale con **opencode** (esperienza stile Claude Code), rispettando i vincoli della macchina target e la regola d'oro dello storage.

**Macchina target**: MacBook Pro M1 Pro, 32 GB RAM unificata, SSD interno 512 GB, **SSD esterno 1.5 TB** (unica destinazione modelli).

**Non-obiettivi**: scrivere un motore di inferenza da zero, GUI/IDE, scrittura LaTeX, training/fine-tuning, multi-utente, deploy cloud.

---

## 2. Moduli e requisiti funzionali

### 2.1 Scout (ricerca + studio modelli) — `interference scout`

- **RF-SCOUT-01** — Cercare su Hugging Face modelli pertinenti al coding (filtri per task, tag, nome, popolarità) via API ufficiale, senza scaricare i pesi.
- **RF-SCOUT-02** — Per ogni candidato, leggere i metadati (`config.json`, dimensioni file, quantizzazioni disponibili, architettura, n. layer, hidden size, n. head/kv-head, context length) necessari alla stima di fattibilità.
- **RF-SCOUT-03** — **Fit-check**: stimare la RAM richiesta come `pesi_quant + KV_cache(context, n_layer, n_kv_head, dtype)` e confrontarla col **budget reale** della macchina target (~20–22 GB), marcando ogni modello **✅ usabile / ⚠️ al limite / ❌ non eseguibile**.
- **RF-SCOUT-04** — Presentare i risultati in **tabella terminale leggibile** (nome, parametri, quantizzazione, dimensione su disco, RAM stimata, verdetto, context max raccomandato sulla macchina).
- **RF-SCOUT-05** — Privilegiare formati/quantizzazioni compatibili con **MLX** (o convertibili), segnalando quando un modello esiste solo in formati non supportati.
- **RF-SCOUT-06** — Non scaricare nulla: lo scout è una fase di **sola valutazione**.

### 2.2 Manager (download su SSD) — `interference pull`

- **RF-MGR-01** — Scaricare un modello scelto **esclusivamente sull'SSD esterno**, in una struttura di cartelle gestita (config-driven via `HF_HOME`/path dedicato).
- **RF-MGR-02** — **Guard regola d'oro**: rifiutare qualsiasi destinazione interna al Mac; se l'SSD non è montato o il path non esiste, **fallire con errore esplicito** (mai ripiegare sul disco interno).
- **RF-MGR-03** — Download robusto: resume, verifica integrità (dimensioni/hash quando disponibili), gestione interruzioni.
- **RF-MGR-04** — Elenco/gestione dei modelli già presenti sull'SSD (`interference list`), con spazio occupato e stato.
- **RF-MGR-05** — Rimozione di un modello dall'SSD (`interference rm`) con conferma.
- **RF-MGR-06** — Validare i file scaricati (config presente e coerente, nessun path traversal nei nomi) prima di considerarli pronti.

### 2.3 Orchestratore (server di inferenza) — `interference serve`

- **RF-ORK-01** — Esporre un endpoint **OpenAI-compatible** (`/v1/...`) su `localhost`, basato su **MLX/`mlx-lm`**, alimentato dai modelli sull'SSD.
- **RF-ORK-02** — **Hot-swap multi-modello**: tenere un modello in RAM e caricarne/scaricarne un altro on-demand, rispettando il budget RAM (mai due modelli grandi contemporaneamente oltre il budget).
- **RF-ORK-03** — **Routing** per tipo di richiesta (es. modello "veloce" per completamenti rapidi, "forte" per task complessi), configurabile.
- **RF-ORK-04** — Streaming dei token; parametri di sampling standard; gestione del context length entro i limiti della macchina.
- **RF-ORK-05** — Rifiutare di caricare modelli che eccedono il budget RAM (coerenza col fit-check dello scout).
- **RF-ORK-06** — Restare in `localhost` per default (privacy); nessuna esposizione di rete senza scelta esplicita dell'utente.

### 2.4 Glue opencode — `interference opencode-config`

- **RF-OC-01** — Generare/aggiornare la configurazione di **opencode** con un provider locale puntato all'endpoint dell'orchestratore.
- **RF-OC-02** — Elencare nella config i modelli disponibili (quelli serviti dall'orchestratore).
- **RF-OC-03** — Fornire uno **smoke test** end-to-end: opencode → orchestratore → modello sull'SSD risponde.

### 2.5 Configurazione & CLI — `interference`

- **RF-CLI-01** — Comando unico `interference` con sottocomandi (`scout`, `pull`, `list`, `rm`, `serve`, `opencode-config`, eventuale `bench`).
- **RF-CLI-02** — Configurazione centralizzata: path SSD/`HF_HOME`, soglie RAM/budget, token HF (da env/keychain), parametri di default dell'orchestratore.
- **RF-CLI-03** — `interference doctor`: verifica ambiente (SSD montato, MLX disponibile, opencode installato, token HF, spazio libero) con diagnosi chiara.

---

## 3. Requisiti non funzionali

- **RNF-01 Privacy** — Nessun dato utente esce dalla macchina; rete solo per HF e download opencode (vedi `CLAUDE.md` §5.3).
- **RNF-02 Regola d'oro** — Storage modelli solo su SSD esterno, enforce-by-design.
- **RNF-03 Vincolo RAM** — Tutte le decisioni su modelli rispettano il budget ~20–22 GB della macchina target.
- **RNF-04 Robustezza input esterno** — Validazione di metadati e file scaricati da HF.
- **RNF-05 Osservabilità** — Output terminale chiaro (tabelle, progress, errori azionabili); log essenziali.
- **RNF-06 Riproducibilità** — Ambiente Python gestito con `uv` (lockfile), Python 3.12.

---

## 4. Criteri di accettazione (end-to-end)

1. `interference doctor` riporta ambiente OK con SSD montato.
2. `interference scout "qwen coder"` mostra una tabella con verdetti ✅/⚠️/❌ coerenti col budget RAM.
3. `interference pull <modello>` scarica **solo** sull'SSD; con SSD smontato fallisce senza toccare il disco interno.
4. `interference serve` espone `/v1` su localhost e fa hot-swap tra due modelli.
5. `interference opencode-config` configura opencode; un prompt da opencode riceve risposta dal modello locale.
