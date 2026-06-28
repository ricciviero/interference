"""Server FastAPI che serve la landing page (HTML/CSS/JS statici).

Avviabile con ``interference landing`` o standalone via ``uvicorn``.
Default su ``127.0.0.1:3000`` — separato dall'orchestratore (:8080).

L'HTML usa path relativi, quindi funziona anche aprendo direttamente
``index.html`` dal Finder (doppio click).
"""

from __future__ import annotations

from pathlib import Path

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import FileResponse
except ImportError as exc:
    raise RuntimeError(
        "Installa l'extra di runtime: `uv sync --extra serve`."
    ) from exc


STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app() -> FastAPI:
    app = FastAPI(
        title="Interference — Landing",
        version="0.1.0",
        description="LLM locali da terminale su Apple Silicon.",
        docs_url=None,
        redoc_url=None,
    )

    @app.get("/", include_in_schema=False)
    async def index():
        return FileResponse(str(STATIC_DIR / "index.html"))

    @app.get("/{filename:path}", include_in_schema=False)
    async def serve_static(filename: str):
        file_path = (STATIC_DIR / filename).resolve()
        if not str(file_path).startswith(str(STATIC_DIR.resolve())):
            raise HTTPException(404)
        if file_path.is_file():
            return FileResponse(str(file_path))
        raise HTTPException(404)

    return app


def serve(*, host: str = "127.0.0.1", port: int = 3000) -> None:
    try:
        import uvicorn
    except ImportError as exc:
        raise RuntimeError(
            "Installa l'extra di runtime: `uv sync --extra serve`."
        ) from exc

    app = create_app()
    uvicorn.run(app, host=host, port=port)
