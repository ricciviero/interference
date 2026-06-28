# Architettura tecnica — Interference

Companion di [`requisiti.md`](requisiti.md). Descrive struttura del codice, runtime, moduli e flussi.

> Pivot 2026-06-28: documento riscritto per il nuovo scope. Vedi `CLAUDE.md` §1.

---

## 1. Stack

| Livello | Scelta | Note |
|---|---|---|
| Linguaggio | **Python 3.12** | gestito con **`uv`** (venv + lockfile) |
| Runtime inferenza | **MLX + `mlx-lm`** | Apple-native, server OpenAI-compatible incluso, quantizzazione |
| HF | **`huggingface_hub`** | ricerca, metadati, download |
| CLI | **Typer** (+ **Rich** per tabelle/progress) | comando unico `interference` |
| API orchestratore | **`mlx-lm` server** (eventuale wrapper **FastAPI/uvicorn**) | endpoint OpenAI-compatible su localhost |
| Config/validazione | **pydantic** (+ pydantic-settings) | config centralizzata, validazione metadati |
| Client di coding | **opencode** (esterno) | provider locale via config generata |

> Niente Rust, Tauri, Docker, DB server, cloud. Vedi `CLAUDE.md` §1.

---

## 2. Struttura del progetto (proposta)

```
interference/
├── pyproject.toml            # progetto + dipendenze (uv)
├── uv.lock
├── interference/             # package
│   ├── __init__.py
│   ├── cli.py                # Typer: scout/pull/list/rm/serve/opencode-config/doctor
│   ├── config.py             # pydantic-settings: path SSD, budget RAM, token HF, default
│   ├── machine.py            # specifiche macchina target + budget RAM effettivo
│   ├── scout/
│   │   ├── search.py         # ricerca HF (huggingface_hub)
│   │   ├── metadata.py       # lettura config.json/metadati senza download
│   │   └── fit.py            # stima RAM (pesi + KV cache) + verdetto ✅/⚠️/❌
│   ├── manager/
│   │   ├── storage.py        # risoluzione path SSD + guard regola d'oro
│   │   ├── download.py       # download su SSD (resume, verifica)
│   │   └── registry.py       # list/rm modelli locali
│   ├── orchestrator/
│   │   ├── server.py         # endpoint OpenAI-compatible su mlx-lm
│   │   ├── pool.py           # hot-swap: carica/scarica modelli entro il budget RAM
│   │   └── routing.py        # routing veloce/forte
│   └── glue/
│       └── opencode.py       # genera/aggiorna config opencode + smoke test
└── docs/
```

---

## 3. Componenti

### 3.1 Scout
- Cerca su HF (filtri coding), per ogni candidato scarica **solo i metadati** (`config.json`, lista file con dimensioni, quantizzazioni).
- `fit.py` stima:
  - `pesi ≈ n_param × byte_per_peso(quant)` (es. Q4 ≈ 0.5–0.6 B/peso effettivi, fp16 = 2 B/peso).
  - `KV_cache ≈ 2 × n_layer × n_kv_head × head_dim × ctx × byte(dtype)`.
  - `overhead` runtime/attivazioni.
- Confronto col **budget** (`machine.py`): RAM totale − riserva macOS/app ≈ 20–22 GB → verdetto e context massimo raccomandato.
- Output Rich: tabella ordinata per fattibilità.

### 3.2 Manager
- `storage.py` è il **punto di enforcement della regola d'oro**: risolve il path modelli da config (SSD), verifica che sia su volume esterno montato, **rifiuta** path che ricadono sul disco interno o se l'SSD non è montato.
- `download.py` usa `huggingface_hub` con `HF_HOME`/`local_dir` sull'SSD, resume e verifica integrità.
- `registry.py`: inventario locale (spazio, stato), rimozione con conferma.

### 3.3 Orchestratore
- `server.py`: endpoint OpenAI-compatible (riuso del server `mlx-lm`, eventuale wrapper FastAPI per hot-swap/routing).
- `pool.py`: tiene al più N modelli residenti entro il budget RAM; carica on-demand, scarica il meno usato; rifiuta modelli oltre budget (coerente col fit-check).
- `routing.py`: mappa tipo di richiesta → modello (veloce/forte), configurabile.
- Default `localhost`, streaming token.

### 3.4 Glue opencode
- `opencode.py`: scrive la config opencode con provider locale (baseURL = endpoint orchestratore, lista modelli), più smoke test end-to-end.

---

## 4. Flussi

**Scoperta → uso:**
```
scout (valuta, NON scarica)
   └─▶ utente sceglie ✅
        └─▶ pull (download SOLO su SSD, con guard)
             └─▶ serve (orchestratore OpenAI-compatible + hot-swap)
                  └─▶ opencode-config (provider locale)
                       └─▶ opencode  ⇄  orchestratore  ⇄  modello (SSD)
```

**Enforcement regola d'oro (ogni I/O modelli):**
```
risolvi path da config ─▶ è su SSD esterno montato? ─ no ─▶ ERRORE esplicito (stop)
                                                     └ sì ─▶ procedi
```

---

## 5. Configurazione

- `config.py` (pydantic-settings) legge da env/file: `INTERFERENCE_MODELS_DIR` (path SSD), `HF_HOME` (→ SSD), budget RAM/soglie, token HF (env/keychain, mai nel repo), host/porta orchestratore, mappa routing.
- `interference doctor` valida tutto l'ambiente prima dell'uso.

---

## 6. Note di performance

- L'SSD esterno (Thunderbolt) impatta **solo il load time**; a modello residente in RAM la velocità di inferenza è la stessa.
- Hot-swap = trade-off load-time vs flessibilità: tenere caldo il modello "veloce", caricare il "forte" on-demand.
- Metriche da misurare prima di ottimizzare (regola `CLAUDE.md` §6): TTFT, tokens/sec, RAM di picco, load time da SSD.
