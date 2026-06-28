"""Configurazione centralizzata (pydantic-settings).

Letta da env (prefisso ``INTERFERENCE_``) o file ``.env``. Il token HF non va
mai nel repo: arriva da env/keychain.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from . import machine


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INTERFERENCE_",
        env_file=".env",
        extra="ignore",
    )

    # --- Storage (REGOLA D'ORO) ---------------------------------------------
    # Cartella dei modelli: DEVE stare sull'SSD esterno. Nessun default interno
    # al Mac: se non impostata, le operazioni sui modelli falliscono di proposito.
    models_dir: Path | None = Field(
        default=None,
        description="Path sull'SSD esterno dove vivono i modelli (es. /Volumes/SSD/interference-models).",
    )

    # --- RAM / budget --------------------------------------------------------
    ram_budget_gb: float = Field(
        default_factory=machine.ram_budget_gb,
        description="RAM disponibile per modello + KV cache.",
    )

    # --- Hugging Face --------------------------------------------------------
    hf_token: str | None = Field(default=None, description="Token HF (da env/keychain, mai nel repo).")

    # --- Orchestratore -------------------------------------------------------
    serve_host: str = Field(default="127.0.0.1", description="Solo localhost per default (privacy).")
    serve_port: int = Field(default=8080)

    def hf_home(self) -> Path | None:
        """``HF_HOME`` da impostare per forzare la cache HF sull'SSD."""
        return self.models_dir / "hf" if self.models_dir else None


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
