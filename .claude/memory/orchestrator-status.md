# Orchestratore & glue opencode — stato corrente

**Stato al 2026-06-28**: scheletri funzionanti ma **non testati con un modello reale**.

- `interference/orchestrator/` (`pool.py` hot-swap LRU, `server.py` FastAPI OpenAI-compatible, `routing.py`) — MLX importato **lazy**: la CLI gira anche senza runtime.
- `interference/glue/opencode.py` — genera la config provider locale per opencode.

## Cosa manca / da sapere prima di toccarli

- Richiede `uv sync --extra serve` (installa `mlx-lm`, `fastapi`, `uvicorn`) **+ SSD montato con almeno un modello** (`interference pull ...`).
- `server.py`: **streaming token non implementato** (solo risposta completa); da aggiungere per UX opencode.
- `routing.py`: `DEFAULT_ROUTES` (`fast`/`strong`) è **vuoto** → va reso config-driven o popolato a mano coi nomi cartella sull'SSD.
- Smoke test end-to-end (RF-OC-03: opencode → orchestratore → modello) **non ancora fatto**.

Moduli `scout` e `manager` invece sono validati (scout testato su HF, guard regola d'oro testato).

_aggiornato: 2026-06-28_
