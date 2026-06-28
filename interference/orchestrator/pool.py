"""Hot-swap multi-modello entro il budget RAM (RF-ORK-02/05).

Tiene caldo al più ``max_resident`` modelli; caricarne un altro scarica il meno
usato di recente (LRU). MLX è importato lazy: senza l'extra ``serve`` la CLI
resta usabile per scout/manager.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class MlxNotInstalled(RuntimeError):
    def __init__(self) -> None:
        super().__init__(
            "mlx-lm non è installato. Installa l'extra di runtime: `uv sync --extra serve`."
        )


def _load_mlx():
    try:
        from mlx_lm import load  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise MlxNotInstalled() from exc
    return load


@dataclass
class ResidentModel:
    name: str
    model: Any
    tokenizer: Any


class ModelPool:
    """Cache LRU di modelli MLX residenti in RAM."""

    def __init__(self, *, max_resident: int = 1) -> None:
        self.max_resident = max_resident
        self._models: OrderedDict[str, ResidentModel] = OrderedDict()

    def get(self, model_path: str | Path) -> ResidentModel:
        key = str(model_path)
        if key in self._models:
            self._models.move_to_end(key)
            return self._models[key]

        load = _load_mlx()
        model, tokenizer = load(key)
        resident = ResidentModel(name=key, model=model, tokenizer=tokenizer)
        self._models[key] = resident
        self._evict_if_needed()
        return resident

    def _evict_if_needed(self) -> None:
        while len(self._models) > self.max_resident:
            old_key, _ = self._models.popitem(last=False)
            # MLX libera la memoria col garbage collector; niente unload esplicito.
            del old_key

    def resident_names(self) -> list[str]:
        return list(self._models.keys())
