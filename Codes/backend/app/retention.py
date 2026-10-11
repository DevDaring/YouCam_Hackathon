"""Retention (spec §11): delete sessions — and their photos, renders and audio — after
IMAGE_RETENTION_HOURS. Runs at startup and every PURGE_EVERY_S while the API is up."""
from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Session

log = logging.getLogger("dearyou.retention")
PURGE_EVERY_S = 15 * 60


async def purge_expired(now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    root = get_settings().STORAGE_DIR
    async with SessionLocal() as db:
        ids = (await db.execute(select(Session.id).where(Session.delete_after.is_not(None), Session.delete_after <= now))).scalars().all()
        for sid in ids:
            shutil.rmtree(root / "sessions" / str(sid), ignore_errors=True)
        if ids:
            await db.execute(delete(Session).where(Session.id.in_(ids)))  # cascades to photos, looks, rooms, votes…
            await db.commit()
    if ids:
        log.warning("retention: deleted %d expired session(s)", len(ids))
    return len(ids)


async def purge_loop() -> None:
    while True:
        try:
            await purge_expired()
        except Exception:  # never let the loop die
            log.exception("retention purge failed")
        await asyncio.sleep(PURGE_EVERY_S)
