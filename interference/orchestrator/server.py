"""Server OpenAI-compatible su MLX (RF-ORK-01/04/06).

Wrapper FastAPI minimale con hot-swap via :class:`ModelPool`. Espone
``/v1/models`` e ``/v1/chat/completions`` (non-streaming in v1; streaming TODO).
Default localhost per privacy.

FastAPI/uvicorn/mlx-lm sono nell'extra ``serve``: importati lazy.
"""

from __future__ import annotations

from typing import Any

from ..config import get_settings
from .pool import ModelPool
from .routing import resolve_route


def build_app(pool: ModelPool):
    """Costruisce l'app FastAPI. Import lazy per non richiedere l'extra se non si serve."""
    try:
        from fastapi import FastAPI
        from pydantic import BaseModel
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Installa l'extra di runtime: `uv sync --extra serve`.") from exc

    from mlx_lm import generate  # type: ignore

    app = FastAPI(title="Interference orchestrator", version="0.1.0")

    class ChatMessage(BaseModel):
        role: str
        content: str

    class ChatRequest(BaseModel):
        model: str
        messages: list[ChatMessage]
        max_tokens: int = 512
        temperature: float = 0.7
        stream: bool = False

    @app.get("/v1/models")
    def list_models() -> dict[str, Any]:
        return {
            "object": "list",
            "data": [{"id": name, "object": "model"} for name in pool.resident_names()],
        }

    @app.post("/v1/chat/completions")
    def chat(req: ChatRequest) -> dict[str, Any]:
        model_path = resolve_route(req.model)
        resident = pool.get(model_path)
        prompt = resident.tokenizer.apply_chat_template(
            [m.model_dump() for m in req.messages],
            add_generation_prompt=True,
        )
        text = generate(
            resident.model,
            resident.tokenizer,
            prompt=prompt,
            max_tokens=req.max_tokens,
        )
        return {
            "object": "chat.completion",
            "model": req.model,
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
            ],
        }

    return app


def serve(*, max_resident: int = 1) -> None:
    """Avvia l'orchestratore su host/porta da config."""
    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Installa l'extra di runtime: `uv sync --extra serve`.") from exc

    settings = get_settings()
    pool = ModelPool(max_resident=max_resident)
    app = build_app(pool)
    uvicorn.run(app, host=settings.serve_host, port=settings.serve_port)
