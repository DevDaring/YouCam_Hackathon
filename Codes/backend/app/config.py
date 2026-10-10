"""Single typed config module. Every setting comes from the project-root `.env`.

The shared `.env` already holds keys under project-specific names (e.g. `YouCam_Phd_API_KEY`),
so each setting accepts the spec name first and falls back to those aliases.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"


def _alias(*names: str) -> AliasChoices:
    return AliasChoices(*names)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore", case_sensitive=True)

    # ---------- App ----------
    APP_ENV: Literal["development", "production", "test"] = "development"
    APP_URL: str = Field("http://localhost:5173", validation_alias=_alias("APP_URL", "NEXT_PUBLIC_APP_URL"))
    MOCK_MODE: bool = True
    DEFAULT_LOCALE: str = "en"
    DEFAULT_COUNTRY: str = "IN"
    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    STORAGE_DIR: Path = ROOT_DIR / "storage"  # private; served only through signed routes

    # ---------- YouCam / Perfect Corp ----------
    YOUCAM_API_KEY: str | None = Field(None, validation_alias=_alias("YOUCAM_API_KEY", "YouCam_Phd_API_KEY"))
    YOUCAM_SECRET_KEY: str | None = Field(None, validation_alias=_alias("YOUCAM_SECRET_KEY", "YouCam_Secret_Key"))
    YOUCAM_API_BASE_URL: str = "https://yce-api-01.makeupar.com"
    YOUCAM_UNIT_BUDGET: int = 900
    YOUCAM_UNIT_RESERVE: int = 150
    YOUCAM_USE_MCP: bool = False
    YOUCAM_MCP_URL: str | None = None

    # ---------- LLM (language tasks: change plans, translation, rewording) ----------
    # Owner choice (D-008): cheap OpenAI-compatible providers. Tried in order; each key is a fallback.
    LLM_PROVIDER_ORDER: str = "deepseek,kimi"
    DEEPSEEK_API_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_API_KEY: str | None = Field(None, validation_alias=_alias("DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_1"))
    DEEPSEEK_API_KEY_2: str | None = None
    DEEPSEEK_MODEL: str = "deepseek-flash"       # live-tested 2026-10-10: 1.7 s, correct JSON
    KIMI_API_BASE_URL: str = "https://api.moonshot.ai/v1"
    KIMI_API_KEY: str | None = Field(None, validation_alias=_alias("KIMI_API_KEY", "KIMI_2009_API_KEY"))
    KIMI_MODEL: str = "kimi-k2.6"                # reasoning model: temperature must be 1, slow
    LLM_TIMEOUT_S: float = 45.0

    # ---------- Images (demo catalogue / probe garments) ----------
    NANOGPT_API_BASE_URL: str = "https://nano-gpt.com/api/v1"
    NANOGPT_API_KEY: str | None = Field(None, validation_alias=_alias("NANOGPT_API_KEY", "NanoGPT_2009_API_KEY", "Nano_GPT_API_KEY"))

    # ---------- Speech ----------
    STT_PROVIDER: Literal["sarvam", "whisper"] = "sarvam"
    OPENAI_API_KEY: str | None = Field(None, validation_alias=_alias("OPENAI_API_KEY", "Open_AI_2009_Key"))  # Whisper fallback only
    SARVAM_API_KEY: str | None = Field(None, validation_alias=_alias("SARVAM_API_KEY", "SARVAM_2009_API_KEY", "SARVAM_88_API_KEY"))
    TTS_ENABLED: bool = False

    # ---------- Geo ----------
    # "offline" = nearest supported city only (no third-party call);
    # "nominatim" = also ask OpenStreetMap Nominatim when no supported city is near.
    GEO_REVERSE_PROVIDER: Literal["offline", "nominatim"] = "offline"
    GEO_NEAREST_CITY_MAX_KM: float = 250.0

    # ---------- Integrity / security ----------
    INTEGRITY_SHARED_SECRET: str
    SHARE_TOKEN_SECRET: str
    STORE_DASHBOARD_PASSWORD: str
    IMAGE_RETENTION_HOURS: int = 72

    # ---------- Auth ----------
    AUTH_SESSION_DAYS: int = 7
    COOKIE_SECURE: bool = False          # true in production (HTTPS)
    DEMO_USER: str | None = "TestUser"   # jury demo account, seeded at startup; empty = none
    DEMO_PASSWORD: str | None = "TestUser11"

    @property
    def youcam_spendable_units(self) -> int:
        return self.YOUCAM_UNIT_BUDGET - self.YOUCAM_UNIT_RESERVE

    @model_validator(mode="after")
    def _fail_fast(self) -> "Settings":
        missing: list[str] = []
        if not self.MOCK_MODE and not self.YOUCAM_API_KEY:
            missing.append("YOUCAM_API_KEY (or YouCam_Phd_API_KEY) — required when MOCK_MODE=false")
        if self.YOUCAM_UNIT_RESERVE >= self.YOUCAM_UNIT_BUDGET:
            missing.append("YOUCAM_UNIT_RESERVE must be smaller than YOUCAM_UNIT_BUDGET")
        if missing:
            raise ValueError("Config error:\n  - " + "\n  - ".join(missing))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
