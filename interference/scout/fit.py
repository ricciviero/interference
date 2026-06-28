"""Fit-check: stima la RAM richiesta da un modello e dà un verdetto per la
macchina target (RF-SCOUT-03).

    RAM ≈ pesi_quant + KV_cache(ctx, n_layer, n_kv_head, head_dim) + overhead

È una *stima*: serve a filtrare, non a garantire. Le quantizzazioni MLX hanno
byte/peso effettivi leggermente variabili (scale/zeri inclusi).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

# Byte effettivi per peso, per tipo di quantizzazione (include overhead scale/zeri).
BYTES_PER_WEIGHT: dict[str, float] = {
    "fp32": 4.0,
    "fp16": 2.0,
    "bf16": 2.0,
    "q8": 1.06,
    "int8": 1.06,
    "q6": 0.82,
    "q5": 0.68,
    "q4": 0.56,
    "int4": 0.56,
    "q3": 0.45,
    "q2": 0.35,
}

# Frazione di overhead runtime (attivazioni, buffer, framework).
_RUNTIME_OVERHEAD = 0.15

# Byte per elemento della KV cache (tipicamente fp16).
_KV_DTYPE_BYTES = 2


class Verdict(str, Enum):
    OK = "✅"          # rientra comodamente nel budget
    TIGHT = "⚠️"       # al limite
    NO = "❌"          # non eseguibile sulla macchina target


@dataclass(frozen=True)
class FitResult:
    weights_gb: float
    kv_cache_gb: float
    total_gb: float
    verdict: Verdict
    recommended_ctx: int


def bytes_per_weight(quant: str | None) -> float:
    """Mappa una stringa di quantizzazione (case-insensitive) a byte/peso."""
    if not quant:
        return BYTES_PER_WEIGHT["fp16"]
    key = quant.lower()
    for token, value in BYTES_PER_WEIGHT.items():
        if token in key:
            return value
    return BYTES_PER_WEIGHT["fp16"]


def kv_cache_gb(*, n_layers: int, n_kv_heads: int, head_dim: int, ctx: int) -> float:
    """KV cache = 2 (K+V) × layer × kv_head × head_dim × ctx × dtype."""
    elements = 2 * n_layers * n_kv_heads * head_dim * ctx
    return elements * _KV_DTYPE_BYTES / (1024**3)


def estimate(
    *,
    n_params: float,
    quant: str | None,
    n_layers: int,
    n_kv_heads: int,
    head_dim: int,
    ctx: int,
    budget_gb: float,
    disk_bytes: int = 0,
) -> FitResult:
    """Stima RAM totale e verdetto per un modello rispetto al budget dato.

    I pesi in RAM ≈ dimensione dei pesi su disco: se ``disk_bytes`` è noto lo si
    usa (segnale più accurato del nome); altrimenti si stima da ``n_params`` ×
    byte/peso della quantizzazione.

    Args:
        n_params: numero di parametri assoluti (es. 14e9). Per i MoE usare i
            parametri *totali* (la RAM dipende dai totali, la velocità dagli attivi).
    """
    if disk_bytes > 0:
        weights_gb = disk_bytes / (1024**3)
    else:
        weights_gb = n_params * bytes_per_weight(quant) / (1024**3)
    kv_gb = kv_cache_gb(n_layers=n_layers, n_kv_heads=n_kv_heads, head_dim=head_dim, ctx=ctx)
    total = (weights_gb + kv_gb) * (1 + _RUNTIME_OVERHEAD)

    if total <= budget_gb * 0.85:
        verdict = Verdict.OK
    elif total <= budget_gb:
        verdict = Verdict.TIGHT
    else:
        verdict = Verdict.NO

    return FitResult(
        weights_gb=weights_gb,
        kv_cache_gb=kv_gb,
        total_gb=total,
        verdict=verdict,
        recommended_ctx=_recommended_ctx(
            weights_gb=weights_gb,
            n_layers=n_layers,
            n_kv_heads=n_kv_heads,
            head_dim=head_dim,
            budget_gb=budget_gb,
        ),
    )


def _recommended_ctx(
    *, weights_gb: float, n_layers: int, n_kv_heads: int, head_dim: int, budget_gb: float
) -> int:
    """Context massimo che resta entro il budget dati i pesi (arrotondato a 1k)."""
    headroom_gb = budget_gb / (1 + _RUNTIME_OVERHEAD) - weights_gb
    if headroom_gb <= 0:
        return 0
    per_token_bytes = 2 * n_layers * n_kv_heads * head_dim * _KV_DTYPE_BYTES
    if per_token_bytes <= 0:
        return 0
    max_ctx = int(headroom_gb * (1024**3) / per_token_bytes)
    return (max_ctx // 1024) * 1024
