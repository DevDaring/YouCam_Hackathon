from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
@router.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    s = get_settings()
    db_ok = (await db.execute(text("select 1"))).scalar() == 1
    return {"ok": db_ok, "env": s.APP_ENV, "mock_mode": s.MOCK_MODE}
