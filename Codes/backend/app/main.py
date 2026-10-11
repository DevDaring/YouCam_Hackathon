from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.auth import seed_demo_user
from app.db import SessionLocal
from app.integrity.quality import close_detector
from app.retention import purge_loop
from app import catalogue
from app.looks import render
from app.routers import auth, health, ledger, looks, regions, sessions

log = logging.getLogger("dearyou")

settings = get_settings()  # fails fast with a readable error if .env is incomplete


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    async with SessionLocal() as db:
        await seed_demo_user(db)
        n = await catalogue.seed(db)
    await render.mark_interrupted()
    log.warning("catalogue: %d items", n)
    log.warning("DearYou API starting — MOCK_MODE=%s, unit budget %s (reserve %s)",
                settings.MOCK_MODE, settings.YOUCAM_UNIT_BUDGET, settings.YOUCAM_UNIT_RESERVE)
    purger = asyncio.create_task(purge_loop()) if settings.APP_ENV != "test" else None
    yield
    if purger:
        purger.cancel()
    close_detector()


app = FastAPI(title="DearYou API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(regions.router)
app.include_router(ledger.router)
app.include_router(sessions.router)
app.include_router(looks.router)

