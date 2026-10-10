"""YouCam service — the single entry point the rest of the app uses.

run_feature(): cache → mock → budget check → upload → task → poll → download → store → ledger.
Typed wrappers below build the documented request bodies (docs/API_NOTES.md §5).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.config import get_settings
from app.ledger import ledger
from app.youcam import cache, mock
from app.youcam.client import YouCamClient, YouCamError
from app.youcam.features import FEATURES, GARMENT_CATEGORIES, SKIN_SIM_SLIDERS

log = logging.getLogger("haan.youcam")
BALANCE_REFRESH_EVERY = 20


@dataclass
class FeatureResult:
    feature: str
    cache_key: str
    image_path: str | None = None          # storage-relative path of the result image
    data: dict[str, Any] = field(default_factory=dict)  # analysis JSON (non-image features)
    cache_hit: bool = False
    mock: bool = False
    units: int = 0


async def _maybe_refresh_balance(db: AsyncSession, client: YouCamClient) -> float | None:
    n = await ledger.live_call_count(db)
    if n == 0 or n % BALANCE_REFRESH_EVERY == 0:
        try:
            return await client.get_credit_balance()
        except YouCamError as e:
            log.warning("balance refresh failed: %s", e)
    return None


async def run_feature(
    db: AsyncSession,
    feature: str,
    src: bytes,
    params: dict,
    *,
    refs: dict[str, bytes] | None = None,
    build_body=None,
    session_id: uuid.UUID | None = None,
    client: YouCamClient | None = None,
) -> FeatureResult:
    """refs: named reference images (garment, necklace…) uploaded alongside src.
    build_body(src_file_id, ref_file_ids) -> request body for the task."""
    spec = FEATURES[feature]
    refs = refs or {}
    key = cache.cache_key(feature, [cache.sha256_bytes(src), *(cache.sha256_bytes(b) for b in refs.values())], params)

    hit = await cache.get(db, key)
    if hit is not None:
        await ledger.record(db, feature=feature, units=0, cache_hit=True, session_id=session_id)
        return FeatureResult(feature, key, hit.result_path, hit.result_json or {}, cache_hit=True)

    if get_settings().MOCK_MODE:
        result, image = await mock.run(feature, src)
        path = storage.save(f"mock/{feature}/{key}.jpg", image) if image else None
        await ledger.record(db, feature=feature, units=0, mock=True, session_id=session_id)
        return FeatureResult(feature, key, path, result.results if not spec.returns_image else {}, mock=True)

    estimate = spec.units(params)
    await ledger.ensure_budget(db, feature, estimate, session_id)

    own_client = client is None
    client = client or YouCamClient()
    try:
        balance_before = await _maybe_refresh_balance(db, client)
        src_id = await client.upload_file(src)
        ref_ids = {name: await client.upload_file(data) for name, data in refs.items()}
        body = build_body(src_id, ref_ids) if build_body else {"src_file_id": src_id, **params}
        task_id = await client.start_task(feature, body)
        try:
            res = await client.wait_task(feature, task_id)
        except YouCamError as e:
            # Engine errors are not charged (API_NOTES §2.5).
            await ledger.record(db, feature=feature, units=0, status="failed", session_id=session_id,
                                note=f"{e.code}: {e.message}"[:500])
            raise
        image_path = None
        if spec.returns_image and res.url:
            image_path = storage.save(f"renders/{feature}/{key}.jpg", await client.download(res.url))
        data = {} if spec.returns_image else res.results
        await cache.put(db, key, feature, image_path, data or None)
        balance_after = None
        if balance_before is not None:  # first call / every 20th: measure real cost (spec §7.6)
            try:
                balance_after = await client.get_credit_balance()
            except YouCamError:
                pass
        await ledger.record(db, feature=feature, units=estimate, session_id=session_id,
                            balance_before=int(balance_before) if balance_before is not None else None,
                            balance_after=int(balance_after) if balance_after is not None else None,
                            note=f"task {task_id}")
        return FeatureResult(feature, key, image_path, data, units=estimate)
    finally:
        if own_client:
            await client.aclose()


# ---------------------------------------------------------------- typed wrappers

async def try_on_cloth(db, src: bytes, garment: bytes, garment_category: str = "auto", *,
                       change_shoes: bool | None = None, session_id=None) -> FeatureResult:
    if garment_category not in GARMENT_CATEGORIES:
        raise ValueError(f"garment_category must be one of {GARMENT_CATEGORIES}")
    params: dict = {"garment_category": garment_category}
    if change_shoes is not None and garment_category in ("full_body", "lower_body"):
        params["change_shoes"] = change_shoes

    def body(src_id, refs):
        return {"src_file_id": src_id, "ref_file_id": refs["garment"], **params}

    return await run_feature(db, "cloth", src, params, refs={"garment": garment}, build_body=body, session_id=session_id)


async def try_on_necklace(db, src: bytes, necklace: bytes, parameter: dict, *, session_id=None) -> FeatureResult:
    """parameter: necklace_* keys from catalogue youcam_params (anchor points, intensities)."""
    params = {"parameter": parameter}

    def body(src_id, refs):
        return {"src_file_id": src_id, "ref_file_ids": [refs["necklace"]],
                "source_info": {"name": src_id},
                "object_infos": [{"name": refs["necklace"], "parameter": parameter}]}

    return await run_feature(db, "necklace", src, params, refs={"necklace": necklace}, build_body=body, session_id=session_id)


async def try_on_earrings(db, src: bytes, earring: bytes, parameter: dict, *, session_id=None) -> FeatureResult:
    params = {"parameter": parameter}

    def body(src_id, refs):
        return {"src_file_id": src_id, "ref_file_ids": [refs["earring"]],
                "source_info": {"name": src_id},
                "object_infos": [{"name": refs["earring"], "parameter": parameter}]}

    return await run_feature(db, "earrings", src, params, refs={"earring": earring}, build_body=body, session_id=session_id)


async def apply_makeup(db, src: bytes, effects: list[dict], *, session_id=None) -> FeatureResult:
    params = {"version": "1.0", "effects": effects}
    return await run_feature(db, "makeup", src, params, session_id=session_id)


async def apply_look(db, src: bytes, template_id: str, *, session_id=None) -> FeatureResult:
    return await run_feature(db, "look", src, {"template_id": template_id}, session_id=session_id)


async def apply_hairstyle(db, src: bytes, template_id: str, *, hair_color: str = "ref", session_id=None) -> FeatureResult:
    return await run_feature(db, "hairstyle", src, {"template_id": template_id, "hair_color": hair_color}, session_id=session_id)


async def analyze_skin(db, src: bytes, dst_actions: list[str], *, session_id=None) -> FeatureResult:
    hd = {a.startswith("hd_") for a in dst_actions}
    if len(hd) > 1:
        raise ValueError("dst_actions must be all SD or all HD")
    return await run_feature(db, "skin_analysis", src, {"dst_actions": dst_actions, "format": "json"}, session_id=session_id)


async def analyze_skin_tone(db, src: bytes, strictness: str = "high", *, session_id=None) -> FeatureResult:
    return await run_feature(db, "skin_tone", src, {"face_angle_strictness_level": strictness}, session_id=session_id)


async def analyze_fitzpatrick(db, src: bytes, *, session_id=None) -> FeatureResult:
    return await run_feature(db, "fitzpatrick", src, {"version": "1.0", "index": 0}, session_id=session_id)


async def analyze_face(db, src: bytes, features: list[str], *, session_id=None) -> FeatureResult:
    return await run_feature(db, "face", src, {"features": features}, session_id=session_id)


async def simulate_skin(db, src: bytes, sliders: dict[str, float], *, session_id=None) -> FeatureResult:
    bad = set(sliders) - set(SKIN_SIM_SLIDERS)
    if bad or not any(sliders.values()):
        raise ValueError(f"unknown sliders {bad}" if bad else "at least one slider must be non-zero")
    return await run_feature(db, "skin_simulation", src, dict(sliders), session_id=session_id)


async def get_credit_balance() -> float:
    client = YouCamClient()
    try:
        return await client.get_credit_balance()
    finally:
        await client.aclose()
