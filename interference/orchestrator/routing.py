"""Routing per tipo di richiesta (RF-ORK-03): mappa un alias logico
('fast'/'strong') al path del modello sull'SSD. Configurabile.
"""

from __future__ import annotations

from pathlib import Path

from ..manager.storage import resolve_models_dir

# Alias logici → nome cartella del modello sull'SSD. Da rendere config-driven.
DEFAULT_ROUTES: dict[str, str] = {
    "fast": "",
    "strong": "",
}


def resolve_route(alias_or_name: str) -> Path:
    """Risolve un alias di routing o un nome modello in un path sull'SSD."""
    models_root = resolve_models_dir() / "models"
    target = DEFAULT_ROUTES.get(alias_or_name, alias_or_name)
    if not target:
        raise ValueError(
            f"Route '{alias_or_name}' non configurata. Imposta DEFAULT_ROUTES o usa un nome modello."
        )
    path = models_root / target
    if not path.exists():
        raise FileNotFoundError(f"Modello '{target}' non presente sull'SSD ({path}).")
    return path
