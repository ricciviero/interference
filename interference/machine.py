"""Specifiche della macchina target e budget RAM effettivo.

Vincolo permanente (CLAUDE.md §1): MacBook Pro M1 Pro, 32 GB RAM unificata.
Il collo di bottiglia è la RAM, non lo spazio SSD.
"""

from __future__ import annotations


# Valori di riferimento della macchina target. Restano costanti perché lo scout
# deve valutare i modelli rispetto a QUESTA macchina anche se gira altrove.
TOTAL_RAM_GB: float = 32.0

# RAM riservata a macOS + app (terminale, browser, ecc.). Conservativa.
OS_RESERVE_GB: float = 10.0


def ram_budget_gb() -> float:
    """RAM realisticamente disponibile per modello + KV cache (~20-22 GB)."""
    return TOTAL_RAM_GB - OS_RESERVE_GB
