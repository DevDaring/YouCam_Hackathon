"""Render cache (spec §7.5). key = sha256(feature, input image hash, canonical params)."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RenderCache


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_key(feature: str, input_hashes: list[str] | str, params: dict) -> str:
    hashes = [input_hashes] if isinstance(input_hashes, str) else list(input_hashes)
    canonical = json.dumps({"f": feature, "in": hashes, "p": params}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def get(db: AsyncSession, key: str) -> RenderCache | None:
    return await db.get(RenderCache, key)


async def put(db: AsyncSession, key: str, feature: str, result_path: str | None, result_json: dict | None) -> RenderCache:
    row = await db.get(RenderCache, key)
    if row is None:
        row = RenderCache(cache_key=key, feature=feature, result_path=result_path, result_json=result_json)
        db.add(row)
    else:
        row.result_path, row.result_json = result_path, result_json
    await db.commit()
    return row
