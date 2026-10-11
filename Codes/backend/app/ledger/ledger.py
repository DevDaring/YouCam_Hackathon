"""Unit ledger (spec §7.6). Every YouCam call — live, cached, mocked, refused — is recorded.

Spendable = YOUCAM_UNIT_BUDGET - YOUCAM_UNIT_RESERVE. A live call is allowed only if
spent + estimate <= spendable. Only live, successful-or-failed calls count as spent;
cache hits and mock calls cost 0.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import UnitLedger


class BudgetExceeded(RuntimeError):
    def __init__(self, spent: int, estimate: int, spendable: int):
        super().__init__(f"Unit budget reached: spent {spent} + {estimate} > {spendable} spendable. Falling back to demo mode.")
        self.spent, self.estimate, self.spendable = spent, estimate, spendable


async def units_spent(db: AsyncSession) -> int:
    q = select(func.coalesce(func.sum(UnitLedger.units), 0)).where(UnitLedger.mock.is_(False), UnitLedger.cache_hit.is_(False))
    return int((await db.execute(q)).scalar_one())


async def live_call_count(db: AsyncSession) -> int:
    q = select(func.count()).select_from(UnitLedger).where(UnitLedger.mock.is_(False), UnitLedger.cache_hit.is_(False),
                                                           UnitLedger.status != "refused")
    return int((await db.execute(q)).scalar_one())


async def ensure_budget(db: AsyncSession, feature: str, estimate: int, session_id: uuid.UUID | None = None) -> None:
    spendable = get_settings().youcam_spendable_units
    spent = await units_spent(db)
    if spent + estimate > spendable:
        await record(db, feature=feature, units=0, status="refused", session_id=session_id,
                     note=f"refused: spent={spent} estimate={estimate} spendable={spendable}")
        raise BudgetExceeded(spent, estimate, spendable)


async def record(
    db: AsyncSession,
    *,
    feature: str,
    units: int,
    cache_hit: bool = False,
    mock: bool = False,
    status: str = "ok",
    session_id: uuid.UUID | None = None,
    balance_before: int | None = None,
    balance_after: int | None = None,
    note: str | None = None,
    account: int | None = None,
    task_id: str | None = None,
) -> UnitLedger:
    row = UnitLedger(feature=feature, units=units, cache_hit=cache_hit, mock=mock, status=status, session_id=session_id,
                     balance_before=balance_before, balance_after=balance_after, note=note, account=account, task_id=task_id)
    db.add(row)
    await db.commit()
    return row


async def summary(db: AsyncSession) -> dict:
    s = get_settings()
    rows = (await db.execute(
        select(UnitLedger.feature,
               func.count(),
               func.coalesce(func.sum(UnitLedger.units).filter(UnitLedger.mock.is_(False), UnitLedger.cache_hit.is_(False)), 0),
               func.count().filter(UnitLedger.cache_hit.is_(True)),
               func.count().filter(UnitLedger.mock.is_(True)),
               func.count().filter(UnitLedger.status == "refused"))
        .group_by(UnitLedger.feature).order_by(UnitLedger.feature)
    )).all()
    spent = await units_spent(db)
    last_balance = (await db.execute(
        select(UnitLedger.balance_after).where(UnitLedger.balance_after.is_not(None)).order_by(UnitLedger.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    return {
        "budget": s.YOUCAM_UNIT_BUDGET,
        "reserve": s.YOUCAM_UNIT_RESERVE,
        "spendable": s.youcam_spendable_units,
        "spent": spent,
        "remaining_spendable": s.youcam_spendable_units - spent,
        "last_known_balance": last_balance,
        "by_feature": [
            {"feature": f, "calls": c, "units": int(u), "cache_hits": ch, "mock_calls": m, "refused": r}
            for f, c, u, ch, m, r in rows
        ],
    }
