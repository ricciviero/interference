"""Generazione della config opencode con provider locale (RF-OC-01/02).

opencode legge ``~/.config/opencode/opencode.json``. Vi aggiunge un provider
OpenAI-compatible che punta all'orchestratore locale.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..config import get_settings
from ..manager.registry import list_models

OPENCODE_CONFIG = Path.home() / ".config" / "opencode" / "opencode.json"


def build_provider_config() -> dict:
    """Costruisce il blocco provider 'interference' per opencode."""
    settings = get_settings()
    base_url = f"http://{settings.serve_host}:{settings.serve_port}/v1"
    models = {m.name: {"name": m.name} for m in list_models()}
    return {
        "provider": {
            "interference": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "Interference (locale)",
                "options": {"baseURL": base_url},
                "models": models,
            }
        }
    }


def write_config(*, path: Path = OPENCODE_CONFIG) -> Path:
    """Scrive/aggiorna la config opencode preservando le chiavi esistenti."""
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if path.exists():
        with open(path, encoding="utf-8") as fh:
            existing = json.load(fh)

    new_block = build_provider_config()
    existing.setdefault("provider", {}).update(new_block["provider"])

    with open(path, "w", encoding="utf-8") as fh:
        json.dump(existing, fh, indent=2)
    return path
