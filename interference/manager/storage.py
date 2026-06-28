"""Enforcement della REGOLA D'ORO: i modelli vivono SOLO sull'SSD esterno.

Ogni I/O sui modelli passa da :func:`resolve_models_dir`, che fallisce in modo
esplicito se la destinazione non è un volume esterno montato. Mai ripiego sul
disco interno (CLAUDE.md §5.1, RF-MGR-02).
"""

from __future__ import annotations

import os
from pathlib import Path

from ..config import get_settings


class GoldenRuleViolation(RuntimeError):
    """Sollevata quando una destinazione modelli non rispetta la regola d'oro."""


# Su macOS i volumi esterni montano sotto /Volumes/<nome>. Il disco interno è
# "/" (ed è esposto come /Volumes/Macintosh HD via symlink): va escluso.
_EXTERNAL_ROOT = Path("/Volumes")
_INTERNAL_VOLUME_NAMES = {"Macintosh HD", "Macintosh HD - Data"}


def _is_external_mount(path: Path) -> bool:
    """True se ``path`` ricade su un volume esterno montato sotto /Volumes."""
    try:
        resolved = path.resolve()
    except OSError:
        return False

    parts = resolved.parts
    # Attesa: ('/', 'Volumes', '<nome volume>', ...)
    if len(parts) < 3 or parts[1] != "Volumes":
        return False

    volume_name = parts[2]
    if volume_name in _INTERNAL_VOLUME_NAMES:
        return False

    volume_root = Path("/") / "Volumes" / volume_name
    # Il volume deve essere effettivamente montato.
    return os.path.ismount(volume_root)


def resolve_models_dir(*, create: bool = False) -> Path:
    """Risolve e valida la cartella dei modelli sull'SSD esterno.

    Args:
        create: se True crea la cartella (dopo che i controlli sono passati).

    Raises:
        GoldenRuleViolation: se la cartella non è configurata, non è su volume
            esterno, oppure l'SSD non è montato.
    """
    settings = get_settings()
    models_dir = settings.models_dir

    if models_dir is None:
        raise GoldenRuleViolation(
            "INTERFERENCE_MODELS_DIR non è configurata. Deve puntare a una cartella "
            "sull'SSD esterno (es. /Volumes/SSD/interference-models). "
            "Nessun fallback sul disco interno: la regola d'oro lo vieta."
        )

    if not _is_external_mount(models_dir):
        raise GoldenRuleViolation(
            f"'{models_dir}' non è su un SSD esterno montato. "
            "Collega l'SSD e verifica che il path sia sotto /Volumes/<ssd>. "
            "I modelli NON possono stare sul disco interno del Mac (regola d'oro)."
        )

    if create:
        models_dir.mkdir(parents=True, exist_ok=True)

    return models_dir


def ensure_hf_home_on_ssd() -> Path:
    """Imposta ``HF_HOME`` sull'SSD e lo restituisce. Da chiamare prima di usare HF."""
    models_dir = resolve_models_dir(create=True)
    hf_home = models_dir / "hf"
    hf_home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(hf_home)
    return hf_home
