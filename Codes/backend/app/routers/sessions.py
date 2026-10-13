"""Shopper sessions: event setup → photos (camera or upload) with a quality gate."""
from __future__ import annotations

import asyncio
import hashlib
import io
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import numpy as np
from PIL import Image
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.auth import current_user
from app.config import get_settings
from app.db import get_db
from app.enhance import EnhanceError, enhance
from app.images import MAX_BYTES, ImageRejected, normalise
from app.ledger import ledger
from app.youcam.client import YouCamError
from app.integrity.quality import assess
from app.models import Photo, Session, User
from app.regions import load_regions

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

ROLES = {"bride", "groom", "family", "guest"}
STYLES = {"traditional", "modern", "minimal", "statement"}


class SessionIn(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)
    city: str | None = Field(None, max_length=80)
    location_source: str = "manual"
    role: str
    event_type: str
    event_date: date | None = None
    budget_amount: Decimal | None = Field(None, gt=0, le=Decimal("100000000"))
    currency: str = Field(min_length=3, max_length=3)
    locale: str = "en"
    style_tags: list[str] = []
    consent: bool


class PhotoOut(BaseModel):
    kind: str
    width: int | None
    height: int | None
    quality: dict | None
    url: str
    enhanced: bool = False
    enhanced_by: str | None = None


class SessionOut(BaseModel):
    id: uuid.UUID
    country_code: str
    city: str | None
    role: str
    event_type: str
    event_date: date | None
    budget_amount: Decimal | None
    currency: str
    style_tags: list[str]
    delete_after: datetime | None
    photos: list[PhotoOut]


def _photo_out(session_id: uuid.UUID, p: Photo) -> PhotoOut:
    return PhotoOut(kind=p.kind, width=p.width, height=p.height, quality=p.quality_json,
                    url=f"/api/sessions/{session_id}/photos/{p.kind}?v={p.hash[:12]}",
                    enhanced=p.original_path is not None, enhanced_by=p.enhanced_by)


async def _owned(db: AsyncSession, session_id: uuid.UUID, user: User) -> Session:
    s = await db.get(Session, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "session not found")
    return s


async def _out(db: AsyncSession, s: Session) -> SessionOut:
    photos = (await db.execute(select(Photo).where(Photo.session_id == s.id).order_by(Photo.kind))).scalars().all()
    return SessionOut(id=s.id, country_code=s.country_code, city=s.city, role=s.role, event_type=s.event_type,
                      event_date=s.event_date.date() if s.event_date else None, budget_amount=s.budget_amount,
                      currency=s.currency, style_tags=s.style_tags, delete_after=s.delete_after,
                      photos=[_photo_out(s.id, p) for p in photos])


@router.post("", response_model=SessionOut, status_code=201)
async def create_session(body: SessionIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SessionOut:
    if not body.consent:
        raise HTTPException(422, "consent required")
    country = load_regions().get(body.country_code)
    if country is None:
        raise HTTPException(422, "unsupported country")
    if body.event_type not in country.events:
        raise HTTPException(422, "event not offered in this country")
    if body.currency.upper() != country.currency:
        raise HTTPException(422, "currency does not match country")
    if body.city and body.city not in {c.name for c in country.cities}:
        raise HTTPException(422, "unsupported city")
    if body.role not in ROLES or not set(body.style_tags) <= STYLES:
        raise HTTPException(422, "invalid role or style")
    if body.location_source not in {"manual", "geolocation", "timezone", "default"}:
        raise HTTPException(422, "invalid location source")
    now = datetime.now(timezone.utc)
    s = Session(
        user_id=user.id, role=body.role, event_type=body.event_type,
        event_date=datetime.combine(body.event_date, time(12), tzinfo=timezone.utc) if body.event_date else None,
        country_code=country.code, city=body.city, location_source=body.location_source, currency=country.currency,
        budget_amount=body.budget_amount, locale=body.locale[:8], style_tags=body.style_tags,
        consent_at=now, delete_after=now + timedelta(hours=get_settings().IMAGE_RETENTION_HOURS),
    )
    db.add(s)
    await db.commit()
    return await _out(db, s)


@router.get("/latest", response_model=SessionOut)
async def latest_session(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SessionOut:
    s = (await db.execute(select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc()).limit(1))).scalar_one_or_none()
    if s is None:
        raise HTTPException(404, "no session yet")
    return await _out(db, s)


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> SessionOut:
    return await _out(db, await _owned(db, session_id, user))


@router.post("/{session_id}/photos", response_model=PhotoOut)
async def upload_photo(
    session_id: uuid.UUID,
    kind: str = Form(...),
    source: str = Form("upload"),  # camera | upload — analytics only
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoOut:
    if kind not in ("full", "face"):
        raise HTTPException(422, "kind must be full or face")
    s = await _owned(db, session_id, user)
    data = await file.read(MAX_BYTES + 1)
    try:
        jpeg, img = await asyncio.to_thread(normalise, data)
    except ImageRejected as e:
        raise HTTPException(422, e.code) from None
    report = await asyncio.to_thread(assess, np.asarray(img), kind)
    digest = hashlib.sha256(jpeg).hexdigest()
    path = storage.save(f"sessions/{s.id}/{kind}-{digest[:16]}.jpg", jpeg)
    old = (await db.execute(select(Photo).where(Photo.session_id == s.id, Photo.kind == kind))).scalars().all()
    for p in old:
        storage.remove(p.storage_path)
    await db.execute(delete(Photo).where(Photo.session_id == s.id, Photo.kind == kind))
    photo = Photo(session_id=s.id, kind=kind, storage_path=path, hash=digest, width=img.width, height=img.height,
                  quality_json={**report.to_dict(), "source": source if source in ("camera", "upload") else "upload"})
    db.add(photo)
    await db.commit()
    return _photo_out(s.id, photo)


@router.get("/{session_id}/photos/{kind}")
async def get_photo(session_id: uuid.UUID, kind: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Response:
    s = await _owned(db, session_id, user)
    p = (await db.execute(select(Photo).where(Photo.session_id == s.id, Photo.kind == kind))).scalar_one_or_none()
    if p is None:
        raise HTTPException(404, "photo not found")
    return Response(storage.read(p.storage_path), media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


def _decode(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


async def _photo(db: AsyncSession, s: Session, kind: str) -> Photo:
    p = (await db.execute(select(Photo).where(Photo.session_id == s.id, Photo.kind == kind))).scalar_one_or_none()
    if p is None:
        raise HTTPException(404, "photo not found")
    return p


@router.post("/{session_id}/photos/{kind}/enhance", response_model=PhotoOut)
async def enhance_photo(session_id: uuid.UUID, kind: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> PhotoOut:
    """Sharpen / de-blur the uploaded photo before try-on (YouCam AI Photo Enhance; NanoGPT fallback).
    The original is kept so the user can restore it."""
    s = await _owned(db, session_id, user)
    p = await _photo(db, s, kind)
    try:
        data, provider = await enhance(db, storage.read(p.storage_path), session_id=s.id)
    except (EnhanceError, YouCamError, ledger.BudgetExceeded) as e:
        raise HTTPException(502, f"enhance_failed: {getattr(e, 'code', e)}"[:200]) from None
    img = await asyncio.to_thread(_decode, data)
    report = await asyncio.to_thread(assess, np.asarray(img), kind)
    digest = hashlib.sha256(data).hexdigest()
    if p.original_path is None:
        p.original_path = p.storage_path
    elif p.storage_path != p.original_path:
        storage.remove(p.storage_path)
    p.storage_path = storage.save(f"sessions/{s.id}/{kind}-enhanced-{digest[:16]}.jpg", data)
    p.hash, p.width, p.height, p.enhanced_by = digest, img.width, img.height, provider
    p.quality_json = {**report.to_dict(), "source": (p.quality_json or {}).get("source", "upload"), "enhanced": True}
    await db.commit()
    return _photo_out(s.id, p)


@router.post("/{session_id}/photos/{kind}/restore", response_model=PhotoOut)
async def restore_photo(session_id: uuid.UUID, kind: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> PhotoOut:
    s = await _owned(db, session_id, user)
    p = await _photo(db, s, kind)
    if p.original_path is None:
        raise HTTPException(409, "not_enhanced")
    storage.remove(p.storage_path)
    data = storage.read(p.original_path)
    img = await asyncio.to_thread(_decode, data)
    report = await asyncio.to_thread(assess, np.asarray(img), kind)
    p.storage_path, p.original_path, p.enhanced_by = p.original_path, None, None
    p.hash, p.width, p.height = hashlib.sha256(data).hexdigest(), img.width, img.height
    p.quality_json = {**report.to_dict(), "source": (p.quality_json or {}).get("source", "upload")}
    await db.commit()
    return _photo_out(s.id, p)
