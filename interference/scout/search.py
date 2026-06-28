"""Ricerca su Hugging Face di modelli da coding (RF-SCOUT-01).

Privilegia i repo ``mlx-community/*`` (già pronti per MLX) ma accetta una query
libera. Non scarica pesi.
"""

from __future__ import annotations

from dataclasses import dataclass

from huggingface_hub import HfApi


@dataclass(frozen=True)
class SearchHit:
    repo_id: str
    downloads: int
    likes: int


def search_models(
    query: str,
    *,
    limit: int = 20,
    mlx_only: bool = True,
    token: str | None = None,
) -> list[SearchHit]:
    """Cerca modelli pertinenti. Se ``mlx_only`` filtra l'autore mlx-community."""
    api = HfApi(token=token)
    search = f"mlx-community/{query}" if mlx_only else query
    # huggingface_hub >=1.0: ordina per downloads discendente (niente `direction`).
    results = api.list_models(
        search=search,
        sort="downloads",
        limit=limit,
    )
    hits: list[SearchHit] = []
    for m in results:
        hits.append(
            SearchHit(
                repo_id=m.id,
                downloads=getattr(m, "downloads", 0) or 0,
                likes=getattr(m, "likes", 0) or 0,
            )
        )
    return hits
