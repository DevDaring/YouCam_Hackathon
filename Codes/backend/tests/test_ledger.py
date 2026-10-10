import pytest

from app.ledger import ledger


async def test_budget_enforced_with_reserve(db):
    # conftest: budget 100, reserve 20 -> 80 spendable
    await ledger.record(db, feature="cloth", units=50)
    await ledger.record(db, feature="cloth", units=10, cache_hit=True)   # free
    await ledger.record(db, feature="cloth", units=10, mock=True)        # free
    assert await ledger.units_spent(db) == 50
    await ledger.ensure_budget(db, "cloth", 30)  # 80 == spendable, allowed
    with pytest.raises(ledger.BudgetExceeded):
        await ledger.ensure_budget(db, "cloth", 31)
    s = await ledger.summary(db)
    assert s["spent"] == 50 and s["remaining_spendable"] == 30
    cloth = next(f for f in s["by_feature"] if f["feature"] == "cloth")
    assert cloth["refused"] == 1 and cloth["cache_hits"] == 1 and cloth["mock_calls"] == 1


async def test_store_units_requires_password(client):
    assert (await client.get("/api/store/units")).status_code == 401
