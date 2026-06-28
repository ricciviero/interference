"""Lettura dei metadati di un modello da Hugging Face SENZA scaricare i pesi
(RF-SCOUT-02): solo ``config.json`` e la lista file con dimensioni.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from huggingface_hub import HfApi, hf_hub_download


@dataclass(frozen=True)
class ModelMeta:
    repo_id: str
    n_params: float          # parametri totali (assoluti)
    n_layers: int
    hidden_size: int
    n_heads: int
    n_kv_heads: int
    head_dim: int
    max_ctx: int
    quant: str | None        # quantizzazione dedotta dal nome/file, se nota
    disk_bytes: int          # somma dimensioni file safetensors/gguf


_PARAM_RE = re.compile(r"(\d+(?:\.\d+)?)\s*b\b", re.IGNORECASE)


def _params_from_name(repo_id: str) -> float | None:
    """Estrae '14B' / '0.6B' / '30b' dal nome repo come fallback."""
    m = _PARAM_RE.search(repo_id.replace("-", " ").replace("_", " "))
    return float(m.group(1)) * 1e9 if m else None


# Token nel nome → etichetta di quantizzazione normalizzata. Copre sia lo stile
# GGUF (q4_k_m) sia quello MLX (4bit, 8bit).
_QUANT_TOKENS: tuple[tuple[str, str], ...] = (
    ("2bit", "q2"), ("3bit", "q3"), ("4bit", "q4"), ("5bit", "q5"),
    ("6bit", "q6"), ("8bit", "q8"),
    ("q2", "q2"), ("q3", "q3"), ("q4", "q4"), ("q5", "q5"),
    ("q6", "q6"), ("q8", "q8"), ("int4", "q4"), ("int8", "q8"),
    ("bf16", "bf16"), ("fp16", "fp16"),
)


def _quant_from_name(repo_id: str) -> str | None:
    name = repo_id.lower()
    for token, label in _QUANT_TOKENS:
        if token in name:
            return label
    return None


def fetch_metadata(repo_id: str, *, token: str | None = None) -> ModelMeta:
    """Scarica config.json e calcola le dimensioni file. Solleva su dati mancanti."""
    api = HfApi(token=token)
    info = api.model_info(repo_id, files_metadata=True)

    disk_bytes = sum(
        (f.size or 0)
        for f in (info.siblings or [])
        if f.rfilename.endswith((".safetensors", ".gguf", ".bin", ".npz"))
    )

    cfg: dict = {}
    try:
        cfg_path = hf_hub_download(repo_id, "config.json", token=token)
        with open(cfg_path, encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception:  # noqa: BLE001 — config assente: si prosegue coi fallback
        cfg = {}

    hidden = int(cfg.get("hidden_size", 0) or 0)
    n_heads = int(cfg.get("num_attention_heads", 0) or 0)
    n_kv = int(cfg.get("num_key_value_heads", n_heads) or n_heads)
    n_layers = int(cfg.get("num_hidden_layers", 0) or 0)
    head_dim = int(cfg.get("head_dim", 0) or (hidden // n_heads if n_heads else 0))
    max_ctx = int(cfg.get("max_position_embeddings", 0) or 0)

    n_params = _params_from_name(repo_id)
    if n_params is None and disk_bytes:
        # stima grezza: assume ~fp16 se non si sa la quant
        n_params = disk_bytes / 2

    if not n_params:
        raise ValueError(f"Impossibile stimare i parametri di {repo_id} (nome e file insufficienti).")

    return ModelMeta(
        repo_id=repo_id,
        n_params=float(n_params),
        n_layers=n_layers,
        hidden_size=hidden,
        n_heads=n_heads,
        n_kv_heads=n_kv,
        head_dim=head_dim,
        max_ctx=max_ctx,
        quant=_quant_from_name(repo_id),
        disk_bytes=disk_bytes,
    )
