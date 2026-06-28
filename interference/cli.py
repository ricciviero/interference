"""CLI ``interference`` (Typer). Cabla scout/manager/orchestratore/glue.

Sottocomandi: doctor, scout, pull, list, rm, serve, opencode-config.
"""

from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from . import __version__
from .config import get_settings

app = typer.Typer(
    name="interference",
    help="Scopri, scarica (su SSD esterno) ed esegui LLM locali da coding. Vedi docs/.",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


@app.command()
def doctor() -> None:
    """Verifica ambiente: SSD montato, MLX, token HF, budget RAM (RF-CLI-03)."""
    from .manager.storage import GoldenRuleViolation, resolve_models_dir

    settings = get_settings()
    table = Table(title=f"interference doctor (v{__version__})")
    table.add_column("Check")
    table.add_column("Stato")

    # SSD / regola d'oro
    try:
        models_dir = resolve_models_dir()
        table.add_row("SSD esterno (regola d'oro)", f"✅ {models_dir}")
    except GoldenRuleViolation as exc:
        table.add_row("SSD esterno (regola d'oro)", f"❌ {exc}")

    # MLX
    try:
        import mlx_lm  # type: ignore  # noqa: F401

        table.add_row("Runtime MLX", "✅ installato")
    except ImportError:
        table.add_row("Runtime MLX", "⚠️ assente (`uv sync --extra serve`)")

    # Token HF
    table.add_row("Token HF", "✅ presente" if settings.hf_token else "⚠️ assente (modelli pubblici OK)")
    table.add_row("Budget RAM", f"{settings.ram_budget_gb:.0f} GB")
    console.print(table)


@app.command()
def scout(
    query: str = typer.Argument(..., help="Testo di ricerca, es. 'qwen coder'."),
    limit: int = typer.Option(15, help="Numero massimo di candidati."),
    ctx: int = typer.Option(8192, help="Context da usare nella stima KV cache."),
    all_repos: bool = typer.Option(False, "--all", help="Non limitare a mlx-community."),
) -> None:
    """Cerca modelli su HF e valuta la fattibilità sulla macchina target (RF-SCOUT-*)."""
    from .scout.fit import estimate
    from .scout.metadata import fetch_metadata
    from .scout.search import search_models

    settings = get_settings()
    hits = search_models(query, limit=limit, mlx_only=not all_repos, token=settings.hf_token)
    if not hits:
        console.print("[yellow]Nessun modello trovato.[/yellow]")
        raise typer.Exit(code=1)

    table = Table(title=f"scout: '{query}' (budget {settings.ram_budget_gb:.0f} GB, ctx {ctx})")
    for col in ("Modello", "Params", "Quant", "Disco", "RAM stim.", "Verdetto", "Ctx max"):
        table.add_column(col)

    for hit in hits:
        try:
            meta = fetch_metadata(hit.repo_id, token=settings.hf_token)
            fit = estimate(
                n_params=meta.n_params,
                quant=meta.quant,
                n_layers=meta.n_layers or 1,
                n_kv_heads=meta.n_kv_heads or 1,
                head_dim=meta.head_dim or 1,
                ctx=ctx,
                budget_gb=settings.ram_budget_gb,
                disk_bytes=meta.disk_bytes,
            )
            table.add_row(
                hit.repo_id,
                f"{meta.n_params/1e9:.1f}B",
                meta.quant or "?",
                f"{meta.disk_bytes/1024**3:.1f} GB",
                f"{fit.total_gb:.1f} GB",
                fit.verdict.value,
                str(fit.recommended_ctx),
            )
        except Exception as exc:  # noqa: BLE001 — un candidato rotto non blocca gli altri
            table.add_row(hit.repo_id, "—", "—", "—", "—", "⁉️", f"[dim]{exc}[/dim]")

    console.print(table)


@app.command()
def pull(repo_id: str = typer.Argument(..., help="Repo HF, es. mlx-community/Qwen2.5-Coder-14B-Instruct-4bit.")) -> None:
    """Scarica un modello SOLO sull'SSD esterno (RF-MGR-*)."""
    from .manager.download import pull_model
    from .manager.storage import GoldenRuleViolation

    try:
        path = pull_model(repo_id)
    except GoldenRuleViolation as exc:
        console.print(f"[red]Regola d'oro:[/red] {exc}")
        raise typer.Exit(code=2)
    console.print(f"[green]Scaricato[/green] su {path}")


@app.command(name="list")
def list_cmd() -> None:
    """Elenca i modelli presenti sull'SSD (RF-MGR-04)."""
    from .manager.registry import list_models
    from .manager.storage import GoldenRuleViolation

    try:
        models = list_models()
    except GoldenRuleViolation as exc:
        console.print(f"[red]Regola d'oro:[/red] {exc}")
        raise typer.Exit(code=2)

    if not models:
        console.print("[yellow]Nessun modello sull'SSD.[/yellow]")
        return
    table = Table(title="Modelli sull'SSD")
    table.add_column("Nome")
    table.add_column("Dimensione")
    for m in models:
        table.add_row(m.name, f"{m.size_bytes/1024**3:.1f} GB")
    console.print(table)


@app.command()
def rm(name: str = typer.Argument(..., help="Nome cartella del modello sull'SSD.")) -> None:
    """Rimuove un modello dall'SSD (RF-MGR-05)."""
    from .manager.registry import remove_model

    if not typer.confirm(f"Rimuovere '{name}' dall'SSD?"):
        raise typer.Abort()
    path = remove_model(name)
    console.print(f"[green]Rimosso[/green] {path}")


@app.command()
def serve(max_resident: int = typer.Option(1, help="Modelli tenuti caldi in RAM (hot-swap).")) -> None:
    """Avvia l'orchestratore OpenAI-compatible su localhost (RF-ORK-*)."""
    from .orchestrator.server import serve as run_serve

    settings = get_settings()
    console.print(f"Orchestratore su http://{settings.serve_host}:{settings.serve_port}/v1")
    run_serve(max_resident=max_resident)


@app.command(name="opencode-config")
def opencode_config() -> None:
    """Genera/aggiorna la config opencode con il provider locale (RF-OC-*)."""
    from .glue.opencode import write_config

    path = write_config()
    console.print(f"[green]Config opencode aggiornata:[/green] {path}")


@app.command()
def landing(
    host: str = typer.Option("127.0.0.1", help="Host su cui esporre la landing."),
    port: int = typer.Option(3000, help="Porta HTTP per la landing."),
) -> None:
    """Avvia il server della landing page (FastAPI + HTML/CSS/JS)."""
    from .landing.server import serve

    console.print(f"Landing page su http://{host}:{port}")
    serve(host=host, port=port)


if __name__ == "__main__":
    app()
