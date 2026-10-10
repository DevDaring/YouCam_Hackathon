from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, ledger, regions

log = logging.getLogger("haan")

settings = get_settings()  # fails fast with a readable error if .env is incomplete


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    log.warning("Haan API starting — MOCK_MODE=%s, unit budget %s (reserve %s)",
                settings.MOCK_MODE, settings.YOUCAM_UNIT_BUDGET, settings.YOUCAM_UNIT_RESERVE)
    yield


app = FastAPI(title="Haan API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(regions.router)
app.include_router(ledger.router)

