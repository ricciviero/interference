# Risorse e link di riferimento — Interference

Indice centralizzato dei link esterni utili allo sviluppo. Verificare periodicamente che siano vivi.

> Pivot 2026-06-28: riscritto per il nuovo scope (Python / MLX / HF / opencode).

---

## Runtime e inferenza (MLX)

- **MLX** (framework Apple ML, Apple Silicon) — https://github.com/ml-explore/mlx
- **mlx-lm** (LLM su MLX: load, generate, **server OpenAI-compatible**, quantizzazione) — https://github.com/ml-explore/mlx-lm
- **mlx-community** (modelli già convertiti/quantizzati per MLX su HF) — https://huggingface.co/mlx-community
- Doc MLX — https://ml-explore.github.io/mlx/

## Hugging Face

- **huggingface_hub** (API ricerca, metadati, download) — https://github.com/huggingface/huggingface_hub
- Doc Hub API / search — https://huggingface.co/docs/huggingface_hub
- Gestione cache / `HF_HOME` — https://huggingface.co/docs/huggingface_hub/guides/manage-cache
- Hub model card / `config.json` — https://huggingface.co/docs/hub/models

## Modelli da coding candidati

- **Qwen2.5-Coder** — https://huggingface.co/collections/Qwen/qwen25-coder
- **Qwen3-Coder** — https://huggingface.co/collections/Qwen/qwen3
- (cercare le varianti `mlx-community/*` per il formato MLX)

## Client di coding (terminale)

- **opencode** (client OpenAI-compatible, stile Claude Code da terminale) — https://github.com/sst/opencode
- Doc opencode (config provider/modelli locali) — https://opencode.ai/docs

## Toolchain Python

- **uv** (gestore progetto/venv/lock) — https://github.com/astral-sh/uv
- **Typer** (CLI) — https://typer.tiangolo.com/
- **Rich** (tabelle/progress terminale) — https://github.com/Textualize/rich
- **pydantic / pydantic-settings** (config + validazione) — https://docs.pydantic.dev/
- **FastAPI / uvicorn** (se serve wrapper orchestratore) — https://fastapi.tiangolo.com/

## Riferimenti hardware / Apple Silicon

- Apple Silicon unified memory & Metal — https://developer.apple.com/metal/
- Note pratiche su RAM/quantizzazione per LLM locali — vedi discussioni mlx-lm e llama.cpp (cross-check delle stime di fit-check)
