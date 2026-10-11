"""Postgres schema (spec §11), extended for multiple countries.

Multi-country additions (see docs/DECISIONS.md D-003):
- sessions carry country_code, city, currency and how the location was chosen;
  precise coordinates are never stored, only the resolved supported city.
- budget is (budget_amount, currency) instead of budget_inr.
- catalogue prices live in catalogue_prices, one row per (item, country); an item
  without a price row for a country is not sold there.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

LAYERS = ("outfit", "necklace", "earrings", "makeup", "hair")
CATEGORIES = ("outfit", "necklace", "earrings", "makeup_look", "lipstick", "hairstyle")

LayerEnum = Enum(*LAYERS, name="layer_kind")
CategoryEnum = Enum(*CATEGORIES, name="catalogue_category")
VoteEnum = Enum("haan", "hmm", "na", name="vote_value")
VerdictEnum = Enum("verified", "check", "not_verified", "pending", name="drift_verdict")
LookStatusEnum = Enum("draft", "shared", "locked", name="look_status")
PhotoKindEnum = Enum("full", "face", name="photo_kind")
LocationSourceEnum = Enum("manual", "geolocation", "timezone", "default", name="location_source")


def _uuid() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = _uuid()
    created_at: Mapped[datetime] = _created()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # bride | groom | family | guest
    event_type: Mapped[str] = mapped_column(String(32))  # key from seed/regions.json for the country
    event_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    country_code: Mapped[str] = mapped_column(String(2), index=True)
    city: Mapped[str | None] = mapped_column(String(80))
    location_source: Mapped[str] = mapped_column(LocationSourceEnum, default="manual")
    currency: Mapped[str] = mapped_column(String(3))
    budget_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    locale: Mapped[str] = mapped_column(String(8), default="en")
    style_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    wear: Mapped[str | None] = mapped_column(String(8))  # women | men — which catalogue to build looks from
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(PhotoKindEnum)
    storage_path: Mapped[str] = mapped_column(Text)
    quality_json: Mapped[dict | None] = mapped_column(JSONB)
    hash: Mapped[str] = mapped_column(String(64), index=True)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created()


class Analysis(Base):
    __tablename__ = "analysis"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    skin_tone_json: Mapped[dict | None] = mapped_column(JSONB)
    fitzpatrick_json: Mapped[dict | None] = mapped_column(JSONB)
    face_json: Mapped[dict | None] = mapped_column(JSONB)
    skin_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()


class CatalogueItem(Base):
    __tablename__ = "catalogue_items"
    id: Mapped[uuid.UUID] = _uuid()
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    category: Mapped[str] = mapped_column(CategoryEnum, index=True)
    name: Mapped[str] = mapped_column(String(120))
    colour_lab: Mapped[list[float] | None] = mapped_column(ARRAY(Numeric(7, 3)))
    colour_family: Mapped[str | None] = mapped_column(String(24))
    metal: Mapped[str | None] = mapped_column(String(16))  # gold | rose_gold | silver | oxidised
    weight_class: Mapped[str | None] = mapped_column(String(8))  # light | medium | heavy
    event_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    youcam_params: Mapped[dict | None] = mapped_column(JSONB)  # e.g. garment_category, makeup palette
    wear: Mapped[str] = mapped_column(String(8), default="any")  # women | men | any
    base_inr: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # India base price; per-country prices in catalogue_prices
    image_path: Mapped[str | None] = mapped_column(Text)
    licence: Mapped[str] = mapped_column(String(80))
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    prices: Mapped[list["CataloguePrice"]] = relationship(back_populates="item", cascade="all, delete-orphan")


class CataloguePrice(Base):
    __tablename__ = "catalogue_prices"
    __table_args__ = (UniqueConstraint("item_id", "country_code"),)
    id: Mapped[uuid.UUID] = _uuid()
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalogue_items.id", ondelete="CASCADE"), index=True)
    country_code: Mapped[str] = mapped_column(String(2), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    item: Mapped[CatalogueItem] = relationship(back_populates="prices")


class Look(Base):
    __tablename__ = "looks"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(LookStatusEnum, default="draft")
    harmony_json: Mapped[dict | None] = mapped_column(JSONB)
    verified_count: Mapped[int] = mapped_column(Integer, default=0)
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    slot: Mapped[int] = mapped_column(Integer, default=1)          # 1..3 within a round
    preset: Mapped[str | None] = mapped_column(String(32))         # makeup / mood preset key
    created_at: Mapped[datetime] = _created()


class LookLayer(Base):
    __tablename__ = "look_layers"
    id: Mapped[uuid.UUID] = _uuid()
    look_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("looks.id", ondelete="CASCADE"), index=True)
    layer: Mapped[str] = mapped_column(LayerEnum)
    item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("catalogue_items.id"))
    render_path: Mapped[str | None] = mapped_column(Text)
    cache_key: Mapped[str | None] = mapped_column(String(64))
    drift_json: Mapped[dict | None] = mapped_column(JSONB)
    verdict: Mapped[str] = mapped_column(VerdictEnum, default="pending")
    units_spent: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)      # render order
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | rendering | done | failed | skipped
    error: Mapped[str | None] = mapped_column(Text)
    params: Mapped[dict | None] = mapped_column(JSONB)             # template id / makeup effects for non-catalogue layers
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    share_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)


class Voter(Base):
    __tablename__ = "voters"
    id: Mapped[uuid.UUID] = _uuid()
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(60))
    relation: Mapped[str | None] = mapped_column(String(40))
    locale: Mapped[str] = mapped_column(String(8), default="en")
    country_code: Mapped[str | None] = mapped_column(String(2))  # family may vote from abroad
    is_decision_maker: Mapped[bool] = mapped_column(Boolean, default=False)


class Vote(Base):
    __tablename__ = "votes"
    id: Mapped[uuid.UUID] = _uuid()
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id", ondelete="CASCADE"))
    look_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("looks.id", ondelete="CASCADE"))
    layer: Mapped[str | None] = mapped_column(LayerEnum)  # NULL = whole look
    value: Mapped[str] = mapped_column(VoteEnum)
    created_at: Mapped[datetime] = _created()


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[uuid.UUID] = _uuid()
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("voters.id", ondelete="CASCADE"))
    look_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("looks.id", ondelete="CASCADE"))
    layer: Mapped[str | None] = mapped_column(LayerEnum)
    audio_path: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[str | None] = mapped_column(Text)
    transcript_en: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class AgentPlan(Base):
    __tablename__ = "agent_plans"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    plan_json: Mapped[dict] = mapped_column(JSONB)
    approved_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()


class RenderCache(Base):
    __tablename__ = "render_cache"
    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    feature: Mapped[str] = mapped_column(String(40))
    result_path: Mapped[str | None] = mapped_column(Text)
    result_json: Mapped[dict | None] = mapped_column(JSONB)  # analysis features return JSON, not images
    created_at: Mapped[datetime] = _created()


class UnitLedger(Base):
    __tablename__ = "unit_ledger"
    id: Mapped[uuid.UUID] = _uuid()
    session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sessions.id", ondelete="SET NULL"), index=True)
    feature: Mapped[str] = mapped_column(String(40), index=True)
    units: Mapped[int] = mapped_column(Integer)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    mock: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | failed | refused
    account: Mapped[int | None] = mapped_column(Integer)  # which YouCam account paid (1 or 2)
    task_id: Mapped[str | None] = mapped_column(String(128))
    balance_before: Mapped[int | None] = mapped_column(Integer)
    balance_after: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class User(Base):
    """Shopper account. The jury demo account is seeded from DEMO_USER / DEMO_PASSWORD."""
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _uuid()
    username: Mapped[str] = mapped_column(String(40), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str | None] = mapped_column(String(60))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)  # sha256 of the cookie value
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = _created()
