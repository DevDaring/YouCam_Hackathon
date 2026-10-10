from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.ledger import ledger

router = APIRouter(prefix="/api/store", tags=["store"])


def require_store_password(x_store_password: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_store_password.encode(), get_settings().STORE_DASHBOARD_PASSWORD.encode()):
        raise HTTPException(401, "store password required")


@router.get("/units", dependencies=[Depends(require_store_password)])
async def units(db: AsyncSession = Depends(get_db)) -> dict:
    return await ledger.summary(db)
