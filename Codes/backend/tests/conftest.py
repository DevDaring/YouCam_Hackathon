"""Tests run against TEST_DATABASE_URL (a separate Postgres DB) in mock mode."""
from __future__ import annotations

import os

from dotenv import dotenv_values

from app.config import ENV_FILE

_env = dotenv_values(ENV_FILE)
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or _env["TEST_DATABASE_URL"]
os.environ["MOCK_MODE"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["YOUCAM_UNIT_BUDGET"] = "100"
os.environ["YOUCAM_UNIT_RESERVE"] = "20"
import tempfile  # noqa: E402

os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="haan-test-storage-")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
import app.models  # noqa: E402,F401


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()
    from app.integrity.quality import close_detector
    close_detector()


@pytest.fixture
async def db():
    async with SessionLocal() as s:
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        await s.execute(text(f"TRUNCATE {tables} CASCADE"))
        await s.commit()
        yield s


@pytest.fixture
async def client():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
