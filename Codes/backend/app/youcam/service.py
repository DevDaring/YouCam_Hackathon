"""YouCam service — the single entry point the rest of the app uses.

run_feature(): cache → mock → budget check → upload → task → poll → download → store → ledger.
Typed wrappers below build the documented request bodies (docs/API_NOTES.md §5).
"""
from __future__ import annotations

import itertools
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

log = logging.getLogger("dearyou.youcam")
BALANCE_REFRESH_EVERY = 20
ACCOUNT_SWITCH_CODES = {"CreditInsufficiency", "InvalidApiKey", "InactiveApiKey", "ExpiredApiKey", "Invalid API key"}
# Last known real balance per YouCam account (D-011). The accounts themselves are the source of truth
# for the judging reserve, because dev and prod keep separate ledgers. Refreshed on first use and
# every 20 calls; decremented locally in between.
_balances: dict[int, float] = {}
_calls: dict[int, int] = {}
_turn = itertools.count()


@dataclass
class FeatureResult:
    feature: str
    cache_key: str
    image_path: str | None = None          # storage-relative path of the result image
    data: dict[str, Any] = field(default_factory=dict)  # analysis JSON (non-image features)
    cache_hit: bool = False
    mock: bool = False
    units: int = 0
    account: int | None = None


def accounts() -> list[int]:
    return list(range(1, len(get_settings().youcam_keys) + 1))


async def account_balance(account: int, client: YouCamClient | None = None, force: bool = False) -> float | None:
    if force or account not in _balances or _calls.get(account, 0) >= BALANCE_REFRESH_EVERY:
        own = client is None
        client = client or YouCamClient(account=account)
        try:
            _balances[account] = await client.get_credit_balance()
            _calls[account] = 0
        except YouCamError as e:
            log.warning("balance refresh failed for account %s: %s", account, e)
        finally:
            if own:
                await client.aclose()
    return _balances.get(account)


async def pick_accounts(estimate: int) -> list[int]:
    """Accounts that can pay `estimate` without touching their reserve, starting round-robin."""
    reserve = get_settings().YOUCAM_UNIT_RESERVE
    accts = accounts()
    start = next(_turn) % max(1, len(accts))
    ok = []
    for a in accts[start:] + accts[:start]:
        bal = await account_balance(a)
        if bal is not None and bal - estimate >= reserve:
            ok.append(a)
    return ok


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
    build_body(src_file_id, ref_file_ids) -> request body for the task.
    Uploads, task and polling all use ONE account (file ids are per account); on a credit/key
    error at task creation the next account is tried with fresh uploads."""
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

    if client is not None:  # injected (tests / probes): use exactly that account
        candidates = [client.account]
        await account_balance(client.account, client)
        reserve = get_settings().YOUCAM_UNIT_RESERVE
        if _balances.get(client.account) is not None and _balances[client.account] - estimate < reserve:
            candidates = []
    else:
        candidates = await pick_accounts(estimate)
    if not candidates:
        await ledger.record(db, feature=feature, units=0, status="refused", session_id=session_id,
                            note=f"refused: every account would drop below the reserve ({dict(_balances)})")
        raise ledger.BudgetExceeded(int(min(_balances.values(), default=0)), estimate, 0)

    last_error: YouCamError | None = None
    for account in candidates:
        c = client or YouCamClient(account=account)
        try:
            balance_before = _balances.get(account)
            src_id = await c.upload_file(src)
            ref_ids = {name: await c.upload_file(data) for name, data in refs.items()}
            body = build_body(src_id, ref_ids) if build_body else {"src_file_id": src_id, **params}
            try:
                task_id = await c.start_task(feature, body)
            except YouCamError as e:
                if e.code in ACCOUNT_SWITCH_CODES:
                    _balances[account] = 0.0 if e.code == "CreditInsufficiency" else _balances.get(account, 0.0)
                    last_error = e
                    log.warning("account %s refused %s (%s); trying the next account", account, feature, e.code)
                    continue
                raise
            try:
                res = await c.wait_task(feature, task_id)
            except YouCamError as e:
                # Engine errors are not charged (API_NOTES §2.5).
                await ledger.record(db, feature=feature, units=0, status="failed", session_id=session_id,
                                    account=account, task_id=task_id, note=f"{e.code}: {e.message}"[:500])
                raise
            except TimeoutError:
                # The task may still finish — and be charged. Keep the id so the result can be fetched later.
                await ledger.record(db, feature=feature, units=estimate, status="timeout", session_id=session_id,
                                    account=account, task_id=task_id, note="stopped waiting; task may still be charged")
                raise YouCamError("poll_timeout", f"task {task_id} still running") from None
            image_path = None
            if spec.returns_image and res.url:
                image_path = storage.save(f"renders/{feature}/{key}.jpg", await c.download(res.url))
            data = {} if spec.returns_image else res.results
            await cache.put(db, key, feature, image_path, data or None)
            _calls[account] = _calls.get(account, 0) + 1
            if account in _balances:
                _balances[account] -= estimate
            await ledger.record(db, feature=feature, units=estimate, session_id=session_id, account=account, task_id=task_id,
                                balance_before=int(balance_before) if balance_before is not None else None)
            return FeatureResult(feature, key, image_path, data, units=estimate, account=account)
        finally:
            if client is None:
                await c.aclose()
    assert last_error is not None
    raise last_error


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


async def apply_hairstyle(db, src: bytes, template_id: str, *, session_id=None) -> FeatureResult:
    # Template mode: hair_color only applies to reference-photo mode (API_NOTES §5.7), so it is not sent.
    return await run_feature(db, "hairstyle", src, {"template_id": template_id}, session_id=session_id)


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


async def get_credit_balance(account: int | None = None) -> float:
    """One account's balance, or the total across all accounts when account is None."""
    total = 0.0
    for a in ([account] if account else accounts()):
        client = YouCamClient(account=a)
        try:
            total += await client.get_credit_balance()
        finally:
            await client.aclose()
    return total
