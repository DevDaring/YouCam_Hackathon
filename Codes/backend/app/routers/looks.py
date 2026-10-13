"""Look Studio API: plan three looks, render them layer by layer, poll progress, retry layers."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.auth import current_user
from app.catalogue import image_path
from app.db import get_db
from app.looks import render
from app.looks.planner import plan, wear_for
from app.looks.presets import LIP_SHADES, MOODS, PRESETS, build_makeup, hair_templates
from app.models import CatalogueItem, CataloguePrice, Look, LookLayer, Photo, Session, User
from app.youcam.features import FEATURES

router = APIRouter(tags=["looks"])
MAX_ROUNDS = 3  # re-plans per session (unit budget guard)
MAX_EDITS = 20  # layer edits per session (unit budget guard)
OPTIONAL_LAYERS = {"necklace", "earrings", "makeup", "hair"}
HEX = __import__("re").compile(r"^#[0-9A-Fa-f]{6}$")
LAYER_UNITS = {"outfit": FEATURES["cloth"].units({}), "necklace": 1, "earrings": 1, "makeup": 1, "hair": 2}


class StartIn(BaseModel):
    wear: Literal["women", "men"] | None = None
    replan: bool = False


async def _owned_session(db: AsyncSession, sid: uuid.UUID, user: User) -> Session:
    s = await db.get(Session, sid)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "session not found")
    return s


async def _owned_look(db: AsyncSession, look_id: uuid.UUID, user: User) -> Look:
    look = await db.get(Look, look_id)
    if look is None:
        raise HTTPException(404, "look not found")
    await _owned_session(db, look.session_id, user)
    return look


async def _prices(db: AsyncSession, country: str) -> dict:
    rows = (await db.execute(select(CataloguePrice).where(CataloguePrice.country_code == country, CataloguePrice.in_stock.is_(True)))).scalars().all()
    return {p.item_id: p.amount for p in rows}


async def _payload(db: AsyncSession, s: Session) -> dict:
    latest = (await db.execute(select(func.max(Look.round)).where(Look.session_id == s.id))).scalar()
    looks = (await db.execute(select(Look).where(Look.session_id == s.id, Look.round == latest).order_by(Look.slot))).scalars().all() if latest else []
    prices = await _prices(db, s.country_code)
    out, rendering = [], False
    for look in looks:
        layers = (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id).order_by(LookLayer.position))).scalars().all()
        done = [l for l in layers if l.status == "done"]
        enabled = [l for l in layers if l.status != "off"]
        rendering |= (any(l.status in ("pending", "rendering") for l in layers) and look.id in render.RUNNING) or look.id in render.ENHANCING
        lay = []
        for l in layers:
            item = await db.get(CatalogueItem, l.item_id) if l.item_id else None
            lay.append({
                "layer": l.layer, "status": l.status, "error": l.error, "units": l.units_spent,
                "render_url": f"/api/looks/{look.id}/image?layer={l.position}&v={l.updated_at.timestamp():.0f}" if l.status == "done" else None,
                "item": {"id": str(item.id), "sku": item.sku, "name": item.name, "price": str(prices.get(item.id)) if item.id in prices else None,
                         "image_url": f"/api/catalogue/{item.id}/image", "metal": item.metal, "licence": item.licence} if item else None,
                "params": {"template_id": (l.params or {}).get("template_id")} if l.layer == "hair" else None,
            })
        last = done[-1] if done else None
        out.append({
            "id": str(look.id), "slot": look.slot, "preset": look.preset, "status": look.status,
            "total_price": str(look.total_price) if look.total_price is not None else None, "currency": look.currency,
            "over_budget": bool(s.budget_amount is not None and look.total_price is not None and look.total_price > s.budget_amount),
            "image_url": f"/api/looks/{look.id}/image?layer={last.position}&v={last.updated_at.timestamp():.0f}" if last else None,
            "layers_done": len(done), "layers_total": len(enabled), "layers": lay,
            "enhance_status": look.enhance_status, "enhance_error": look.enhance_error, "enhanced_by": look.enhanced_by,
            "enhanced_url": f"/api/looks/{look.id}/enhanced?v={abs(hash(look.enhanced_path)) % 10**8}" if look.enhanced_path and look.enhance_status == "done" else None,
        })
    return {"wear": wear_for(s), "round": latest or 0, "rounds_left": MAX_ROUNDS - (latest or 0),
            "edits_left": MAX_EDITS - (s.edit_count or 0),
            "budget_amount": str(s.budget_amount) if s.budget_amount is not None else None, "currency": s.currency,
            "rendering": rendering, "looks": out}


@router.get("/api/sessions/{sid}/looks")
async def get_looks(sid: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await _payload(db, await _owned_session(db, sid, user))


@router.post("/api/sessions/{sid}/looks")
async def start_looks(sid: uuid.UUID, body: StartIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _owned_session(db, sid, user)
    if body.wear:
        s.wear = body.wear
    wear = wear_for(s)
    if wear is None:
        raise HTTPException(422, "wear_required")
    if (await db.execute(select(Photo).where(Photo.session_id == s.id, Photo.kind == "full"))).scalar_one_or_none() is None:
        raise HTTPException(422, "photo_required")
    latest = (await db.execute(select(func.max(Look.round)).where(Look.session_id == s.id))).scalar() or 0
    if latest and not body.replan:
        await db.commit()
        return await _payload(db, s)  # idempotent: never spend units twice by accident
    if latest >= MAX_ROUNDS:
        raise HTTPException(429, "round_limit")

    items = (await db.execute(select(CatalogueItem))).scalars().all()
    prices = await _prices(db, s.country_code)
    planned = plan(s, list(items), prices, wear)
    if not planned:
        raise HTTPException(503, "catalogue_empty")
    new_round = latest + 1
    for p in planned:
        total = sum((prices[i.id] for i in (p.outfit, p.necklace, p.earrings) if i is not None), Decimal(0))
        look = Look(session_id=s.id, round=new_round, slot=p.slot, preset=p.preset, name=p.preset, status="draft",
                    total_price=total, currency=s.currency)
        db.add(look)
        await db.flush()
        for pos, layer in enumerate(p.layers):
            item = {"outfit": p.outfit, "necklace": p.necklace, "earrings": p.earrings}.get(layer)
            params = None
            if layer == "makeup":
                params = {"effects": PRESETS[p.preset]["makeup"]}
            elif layer == "hair":
                params = {"template_id": PRESETS[p.preset]["hair"][wear]}
            db.add(LookLayer(look_id=look.id, layer=layer, item_id=item.id if item else None, position=pos, status="pending", params=params))
    await db.commit()
    for look in (await db.execute(select(Look).where(Look.session_id == s.id, Look.round == new_round))).scalars().all():
        render.start(look.id)
    return await _payload(db, s)


@router.post("/api/looks/{look_id}/retry")
async def retry_look(look_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    look = await _owned_look(db, look_id, user)
    layers = (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id).order_by(LookLayer.position))).scalars().all()
    orphaned = look.id not in render.RUNNING
    first_bad = next((l.position for l in layers if l.status in ("failed", "skipped") or (orphaned and l.status in ("pending", "rendering"))), None)
    if first_bad is None:
        raise HTTPException(409, "nothing_to_retry")
    s = await db.get(Session, look.session_id)
    look.enhanced_path, look.enhance_status, look.enhance_error, look.enhanced_by = None, None, None, None
    for l in layers:
        if l.position >= first_bad and l.status != "done":
            l.status, l.error = "pending", None
            # Use today's presets, so a corrected makeup/hair preset reaches looks planned earlier.
            if l.layer == "makeup" and look.preset in PRESETS:
                l.params = {"effects": PRESETS[look.preset]["makeup"]}
            elif l.layer == "hair" and look.preset in PRESETS and wear_for(s):
                l.params = {"template_id": PRESETS[look.preset]["hair"][wear_for(s)]}
    await db.commit()
    render.start(look.id, from_position=first_bad)
    return await _payload(db, s)


@router.get("/api/looks/{look_id}/image")
async def look_image(look_id: uuid.UUID, layer: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Response:
    look = await _owned_look(db, look_id, user)
    l = (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id, LookLayer.position == layer))).scalar_one_or_none()
    if l is None or not l.render_path:
        raise HTTPException(404, "not rendered yet")
    return Response(storage.read(l.render_path), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/api/catalogue/{item_id}/image")
async def catalogue_image(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    item = await db.get(CatalogueItem, item_id)
    p = image_path(item) if item else None
    if p is None:
        raise HTTPException(404, "no image")
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@router.get("/api/units/estimate")
def units_estimate(wear: Literal["women", "men"] = "women") -> dict:
    from app.looks.presets import LAYERS_BY_WEAR
    per_look = sum(LAYER_UNITS[l] for l in LAYERS_BY_WEAR[wear])
    return {"per_look": per_look, "per_round": per_look * 3}



# ---------------------------------------------------------------- per-layer editing (spec K1 "tweak any layer")

async def _layers(db: AsyncSession, look: Look) -> list[LookLayer]:
    return (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id).order_by(LookLayer.position))).scalars().all()


def _units_from(layers: list[LookLayer], pos: int, enabled_override: dict | None = None) -> tuple[int, list[str]]:
    affected = [l for l in layers if l.position >= pos and (enabled_override or {}).get(l.position, l.status != "off")]
    return sum(LAYER_UNITS[l.layer] for l in affected), [l.layer for l in affected]


async def _recompute_total(db: AsyncSession, look: Look, layers: list[LookLayer], prices: dict) -> None:
    look.total_price = sum((prices.get(l.item_id, Decimal(0)) for l in layers if l.item_id and l.status != "off"), Decimal(0))


@router.get("/api/looks/{look_id}/options/{layer}")
async def layer_options(look_id: uuid.UUID, layer: Literal["outfit", "necklace", "earrings", "makeup", "hair"],
                        user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    look = await _owned_look(db, look_id, user)
    s = await db.get(Session, look.session_id)
    layers = await _layers(db, look)
    target = next((l for l in layers if l.layer == layer), None)
    if target is None:
        raise HTTPException(404, "layer not in this look")
    units, affected = _units_from(layers, target.position, {target.position: True})
    out: dict = {"layer": layer, "enabled": target.status != "off", "removable": layer in OPTIONAL_LAYERS,
                 "units_to_rerender": units, "layers_affected": affected, "edits_left": MAX_EDITS - (s.edit_count or 0)}
    wear = wear_for(s) or "women"
    if layer in ("outfit", "necklace", "earrings"):
        prices = await _prices(db, s.country_code)
        items = (await db.execute(select(CatalogueItem).where(CatalogueItem.category == layer, CatalogueItem.wear.in_((wear, "any"))))).scalars().all()
        out["items"] = sorted(({
            "id": str(i.id), "sku": i.sku, "name": i.name, "price": str(prices[i.id]) if i.id in prices else None, "currency": s.currency,
            "image_url": f"/api/catalogue/{i.id}/image", "metal": i.metal, "weight_class": i.weight_class, "colour_family": i.colour_family,
            "licence": i.licence, "event_match": s.event_type in (i.event_tags or []), "current": i.id == target.item_id,
        } for i in items if i.id in prices), key=lambda x: (not x["current"], not x["event_match"], float(x["price"] or 0)))
    elif layer == "makeup":
        effects = (target.params or {}).get("effects") or []
        lip = next((e["palettes"][0]["color"] for e in effects if e.get("category") == "lip_color"), MOODS.get(look.preset, MOODS["sindoor_dusk"])[0])
        cur_preset = (target.params or {}).get("preset") or look.preset
        out["makeup"] = {"presets": [{"key": k, "lip": v[0], "blush": v[2], "shadow": v[3], "current": k == cur_preset} for k, v in MOODS.items()],
                         "lip_shades": [{"key": k, "hex": h} for k, h in LIP_SHADES.items()],
                         "current_preset": cur_preset, "current_lip": lip}
    else:
        cur = (target.params or {}).get("template_id")
        out["hair"] = [{**t, "current": t["template_id"] == cur} for t in hair_templates(wear)]
    return out


class LayerEdit(BaseModel):
    item_id: uuid.UUID | None = None
    preset: str | None = None
    lip: str | None = None
    template_id: str | None = None
    enabled: bool | None = None


@router.patch("/api/looks/{look_id}/layers/{layer}")
async def edit_layer(look_id: uuid.UUID, layer: Literal["outfit", "necklace", "earrings", "makeup", "hair"], body: LayerEdit,
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    look = await _owned_look(db, look_id, user)
    s = await db.get(Session, look.session_id)
    if look.id in render.RUNNING:
        raise HTTPException(409, "look_busy")
    if (s.edit_count or 0) >= MAX_EDITS:
        raise HTTPException(429, "edit_limit")
    layers = await _layers(db, look)
    target = next((l for l in layers if l.layer == layer), None)
    if target is None:
        raise HTTPException(404, "layer not in this look")
    wear = wear_for(s) or "women"
    prices = await _prices(db, s.country_code)

    if body.enabled is not None:
        if layer not in OPTIONAL_LAYERS:
            raise HTTPException(422, "not_removable")
        if not body.enabled:
            target.status, target.error = "off", None
        elif target.status == "off":
            target.status = "pending"
    elif body.item_id is not None:
        item = await db.get(CatalogueItem, body.item_id)
        if item is None or item.category != layer or item.wear not in (wear, "any") or item.id not in prices:
            raise HTTPException(422, "invalid_choice")
        target.item_id = item.id
    elif layer == "makeup" and (body.preset or body.lip):
        preset = body.preset or (target.params or {}).get("preset") or look.preset
        if preset not in MOODS or (body.lip and not HEX.match(body.lip)):
            raise HTTPException(422, "invalid_choice")
        lip = body.lip if body.lip else None
        target.params = {"effects": build_makeup(preset, lip), "preset": preset, "lip": lip or MOODS[preset][0]}
    elif layer == "hair" and body.template_id:
        if body.template_id not in {t["template_id"] for t in hair_templates(wear)}:
            raise HTTPException(422, "invalid_choice")
        target.params = {"template_id": body.template_id}
    else:
        raise HTTPException(422, "invalid_choice")

    # This layer and every later enabled layer re-render from the image just before it.
    for l in layers:
        if l.position >= target.position and l.status != "off":
            l.status, l.error = "pending", None
    await _recompute_total(db, look, layers, prices)
    look.enhanced_path, look.enhance_status, look.enhance_error, look.enhanced_by = None, None, None, None
    s.edit_count = (s.edit_count or 0) + 1
    await db.commit()
    render.start(look.id, from_position=target.position)
    return await _payload(db, s)


@router.post("/api/looks/{look_id}/enhance")
async def enhance_look(look_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Sharpen / de-blur the finished look (YouCam AI Photo Enhance; NanoGPT fallback). Counts as one edit."""
    look = await _owned_look(db, look_id, user)
    s = await db.get(Session, look.session_id)
    if look.id in render.RUNNING or look.id in render.ENHANCING:
        raise HTTPException(409, "look_busy")
    if not any(l.status == "done" for l in await _layers(db, look)):
        raise HTTPException(409, "nothing_to_enhance")
    if (s.edit_count or 0) >= MAX_EDITS:
        raise HTTPException(429, "edit_limit")
    look.enhance_status, look.enhance_error = "running", None
    s.edit_count = (s.edit_count or 0) + 1
    await db.commit()
    render.start_enhance(look.id)
    return await _payload(db, s)


@router.delete("/api/looks/{look_id}/enhance")
async def clear_enhance(look_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    look = await _owned_look(db, look_id, user)
    if look.id in render.ENHANCING:
        raise HTTPException(409, "look_busy")
    look.enhanced_path, look.enhance_status, look.enhance_error, look.enhanced_by = None, None, None, None
    await db.commit()
    return await _payload(db, await db.get(Session, look.session_id))


@router.get("/api/looks/{look_id}/enhanced")
async def enhanced_image(look_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Response:
    look = await _owned_look(db, look_id, user)
    if not look.enhanced_path:
        raise HTTPException(404, "not enhanced")
    return Response(storage.read(look.enhanced_path), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})
