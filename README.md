# Interference

> **Run coding LLMs locally on Apple Silicon — discover, download to external SSD, serve via OpenAI-compatible API, use with opencode.**

Interference is a terminal toolkit that brings the "Claude Code experience" entirely on-device: it discovers coding models on Hugging Face, evaluates whether they fit your Mac's RAM, downloads them **exclusively to an external SSD**, and exposes them through an OpenAI-compatible server backed by [MLX](https://github.com/mlx-explore/mlx). No cloud in the inference path.

```
scout (evaluate)  →  pull (SSD)  →  serve (MLX)  →  opencode (use it)
```

## Why

- **100% local** — your code never leaves the machine
- **Zero cloud** — no API keys, no rate limits, no subscription
- **Apple Silicon native** — MLX runs on Metal GPU on M1/M2/M3/M4
- **External SSD enforcement** — models stay off your internal drive, by design
- **opencode integration** — one command to configure the local provider

## Requirements

- **macOS** with Apple Silicon (M1 Pro 32 GB recommended; works on any M-series)
- **External SSD** for model storage (1.5 TB free recommended; the golden rule)
- **Python 3.12+**, [`uv`](https://github.com/astral-sh/uv)

## Quick start

```bash
# 1. Clone & install
git clone https://github.com/YOUR_USER/interference.git
cd interference
uv sync                    # base CLI: scout, manager
uv sync --extra serve      # + MLX runtime & server

# 2. Configure your external SSD (required — no fallback to internal disk)
export INTERFERENCE_MODELS_DIR="/Volumes/<your-ssd>/interference-models"

# 3. Check everything is ready
uv run interference doctor

# 4. Discover coding models that fit your machine
uv run interference scout "qwen coder"

# 5. Download a model to the SSD
uv run interference pull mlx-community/Qwen3-Coder-30B-A3B-Instruct-3bit

# 6. Start the OpenAI-compatible server
uv run interference serve

# 7. Wire it into opencode
uv run interference opencode-config

# 8. Open opencode — it now talks to your local model
```

## Commands

| Command | What it does |
|---|---|
| `interference doctor` | Verify environment: SSD mounted, MLX ready, HF token |
| `interference scout <query>` | Search Hugging Face for coding models, show fit on your machine (✅/⚠️/❌) |
| `interference pull <repo>` | Download a model **only** to the external SSD (golden rule enforced) |
| `interference list` | List models on the SSD with size |
| `interference rm <name>` | Remove a model from the SSD |
| `interference serve` | Start OpenAI-compatible server on `localhost:8080` (MLX-powered) |
| `interference opencode-config` | Generate/update `opencode.json` with the local provider |

## How it works

**Scout** queries Hugging Face for coding models (`mlx-community/*`), reads their `config.json` metadata, and estimates RAM usage as `weights + KV cache + overhead` against your machine's realistic budget (~22 GB on a 32 GB Mac). Each model gets a verdict: ✅ fits comfortably, ⚠️ borderline, ❌ won't run.

**Manager** handles downloads through `huggingface_hub`, enforcing the **golden rule**: every model file goes to the external SSD only. If the SSD isn't mounted or the path points to the internal disk, the operation fails explicitly — no silent fallback.

**Orchestrator** wraps `mlx-lm` in a FastAPI server exposing `/v1/chat/completions` and `/v1/models`. It supports hot-swap between models (LRU cache), streaming responses (SSE), and RAM budget enforcement.

**Glue** generates an `opencode.json` provider block pointing to `localhost:8080/v1`, so opencode talks to your local models with zero configuration effort.

## Recommended models

Tested on M1 Pro 32 GB with ~22 GB RAM budget:

| Model | Size | RAM | Context | Notes |
|---|---|---|---|---|
| `Qwen3-Coder-30B-A3B-Instruct-3bit` | 12.4 GB | ✅ 15 GB | 72k | MoE, ~3B active, very fast |
| `Qwen2.5-Coder-14B-Instruct-4bit` | 7.7 GB | ✅ 11 GB | 61k | Solid all-rounder |
| `Qwen2.5-Coder-7B-Instruct-4bit` | 4.0 GB | ✅ 5 GB | 282k | Great for autocomplete |
| `Qwen2.5-Coder-1.5B-Instruct-4bit` | 0.8 GB | ✅ 1 GB | 686k | Instant responses |

Run `interference scout "qwen coder"` to see your machine's fit scores.

## Golden rule

> **No model files on the internal Mac SSD. Ever. All models live on the external SSD.**

This is enforced at the code level: `interference pull`, `serve`, and `list` all validate the target path is an external volume mounted under `/Volumes/`. If the SSD is disconnected, operations fail with a clear error. There is no fallback.

## Configuration

All settings via environment variables (or `.env` file):

| Variable | Required | Default | Description |
|---|---|---|---|
| `INTERFERENCE_MODELS_DIR` | Yes | — | Path on external SSD for models |
| `INTERFERENCE_HF_TOKEN` | No | — | Hugging Face token (for gated repos) |
| `INTERFERENCE_SERVE_HOST` | No | `127.0.0.1` | Server bind address |
| `INTERFERENCE_SERVE_PORT` | No | `8080` | Server port |

## Privacy

Interference is built for local-first use:

- **No telemetry, no analytics, no phoning home**
- **Network only for** Hugging Face (model discovery/download) and opencode install
- **Inference is entirely offline** — once a model is downloaded, no connection needed
- `serve` binds to `localhost` by default

## Development

```bash
uv sync                    # base dependencies
uv sync --extra serve      # full runtime
uv run interference --help
```

Project structure and conventions: [`CLAUDE.md`](CLAUDE.md).
Architecture and requirements: [`docs/`](docs/).

## License

MIT — see [LICENSE](LICENSE).
