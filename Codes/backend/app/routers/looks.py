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
from app.looks.presets import PRESETS
from app.models import CatalogueItem, CataloguePrice, Look, LookLayer, Photo, Session, User
from app.youcam.features import FEATURES

router = APIRouter(tags=["looks"])
MAX_ROUNDS = 3  # re-plans per session (unit budget guard)
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
        rendering |= any(l.status in ("pending", "rendering") for l in layers) and look.id in render.RUNNING
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
            "layers_done": len(done), "layers_total": len(layers), "layers": lay,
        })
    return {"wear": wear_for(s), "round": latest or 0, "rounds_left": MAX_ROUNDS - (latest or 0),
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

