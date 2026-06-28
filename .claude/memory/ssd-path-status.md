# SSD esterno — stato corrente

La **regola d'oro** vuole tutti i modelli sull'SSD esterno (1.5 TB liberi). Il path è **config-driven** via `INTERFERENCE_MODELS_DIR` (e `HF_HOME` derivato), nessun hardcoding.

**Stato al 2026-06-28**: SSD **collegato e configurato**. Nome volume: **`Archivio`** → `/Volumes/Archivio` (1.8 TiB, ~1.4 TiB liberi). `INTERFERENCE_MODELS_DIR="/Volumes/Archivio/interference-models"` impostata in `.env`. `interference doctor` → ✅ sulla regola d'oro. La cartella `interference-models/` viene creata al primo `pull` (`create=True`).

> ⚠️ Il volume monta come `/Volumes/Archivio` (A maiuscola). Il filesystem è case-insensitive ma usa la forma corretta nei path.

## Note

- Il guard (`interference/manager/storage.py`) rifiuta path interni al Mac e SSD non montato. Se scolleghi l'SSD, `pull`/`serve`/`list` falliranno di proposito (nessun fallback sul disco interno).
- Manca ancora: runtime MLX (`uv sync --extra serve`) e — opzionale — token HF per repo privati.

_aggiornato: 2026-06-28_
