"""Download dei modelli SOLO sull'SSD esterno (RF-MGR-01/03).

Passa sempre da :mod:`interference.manager.storage` per l'enforcement della
regola d'oro. ``huggingface_hub`` gestisce resume e verifica.
"""

from __future__ import annotations

from pathlib import Path

from huggingface_hub import snapshot_download

from ..config import get_settings
from .storage import ensure_hf_home_on_ssd, resolve_models_dir


def pull_model(repo_id: str) -> Path:
    """Scarica ``repo_id`` sull'SSD. Solleva GoldenRuleViolation se l'SSD non è valido."""
    settings = get_settings()
    # 1) Enforce regola d'oro + HF_HOME sull'SSD.
    ensure_hf_home_on_ssd()
    models_dir = resolve_models_dir(create=True)

    # 2) Destinazione esplicita sull'SSD (oltre alla cache HF, già su SSD).
    local_dir = models_dir / "models" / repo_id.replace("/", "__")
    local_dir.mkdir(parents=True, exist_ok=True)

    # In huggingface_hub >=1.0 il resume è il comportamento di default.
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        token=settings.hf_token,
    )
    return local_dir
