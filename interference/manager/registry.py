"""Inventario dei modelli presenti sull'SSD (RF-MGR-04/05)."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .storage import resolve_models_dir


@dataclass(frozen=True)
class LocalModel:
    name: str
    path: Path
    size_bytes: int


def _dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def list_models() -> list[LocalModel]:
    """Modelli scaricati sull'SSD, con spazio occupato."""
    models_root = resolve_models_dir() / "models"
    if not models_root.exists():
        return []
    out: list[LocalModel] = []
    for d in sorted(models_root.iterdir()):
        if d.is_dir():
            out.append(LocalModel(name=d.name, path=d, size_bytes=_dir_size(d)))
    return out


def remove_model(name: str) -> Path:
    """Rimuove un modello dall'SSD. Solleva FileNotFoundError se assente."""
    target = resolve_models_dir() / "models" / name
    if not target.exists():
        raise FileNotFoundError(f"Modello '{name}' non trovato sull'SSD.")
    shutil.rmtree(target)
    return target
