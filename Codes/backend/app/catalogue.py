"""Demo catalogue ('Utsav House') — seeded from seed/catalogue/catalogue.json at startup.

Each market gets its own price list (D-003). Demo prices come from the India base price with
fixed, rounded conversion factors — a stand-in for a merchant's real per-market pricing,
never a live FX rate.
"""
from __future__ import annotations

import json
import math
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import ROOT_DIR
from app.models import CatalogueItem, CataloguePrice
from app.regions import load_regions

CATALOGUE_DIR = ROOT_DIR / "seed" / "catalogue"
DEMO_FACTOR = {"INR": 1.0, "BDT": 1.42, "NPR": 1.6, "PKR": 3.35, "LKR": 3.55, "AED": 0.044, "GBP": 0.0095,
               "USD": 0.012, "CAD": 0.0165, "AUD": 0.0183, "SGD": 0.0158}


def shop_price(amount: float) -> Decimal:
    """Round to a believable shelf price: 2 significant figures, then end in 9 for larger amounts."""
    if amount <= 0:
        return Decimal(0)
    mag = 10 ** max(0, int(math.floor(math.log10(amount))) - 1)
    rounded = math.floor(amount / mag + 0.5) * mag  # half-up, not banker's rounding
    if rounded >= 100:
        rounded -= 1  # 38500 → 38499, 460 → 459
    return Decimal(str(rounded))


def image_path(item: CatalogueItem) -> Path | None:
    if not item.image_path:
        return None
    p = (CATALOGUE_DIR / item.image_path).resolve()
    return p if CATALOGUE_DIR.resolve() in p.parents and p.exists() else None


async def seed(db: AsyncSession) -> int:
    f = CATALOGUE_DIR / "catalogue.json"
    if not f.exists():
        return 0
    data = json.loads(f.read_text(encoding="utf-8"))
    countries = load_regions().countries
    existing = {i.sku: i for i in (await db.execute(select(CatalogueItem))).scalars().all()}
    for raw in data["items"]:
        item = existing.get(raw["sku"]) or CatalogueItem(sku=raw["sku"])
        item.category = raw["category"]
        item.name = raw["name"]
        item.wear = raw.get("wear", "any")
        item.colour_lab = raw.get("colour_lab")
        item.colour_family = raw.get("colour_family")
        item.metal = raw.get("metal")
        item.weight_class = raw.get("weight_class")
        item.event_tags = raw.get("event_tags", [])
        item.youcam_params = {"garment_category": raw["garment_category"]} if raw.get("garment_category") else None
        item.image_path = raw.get("image")
        item.licence = raw.get("licence", "AI-generated")
        item.is_ai_generated = bool(raw.get("is_ai_generated", True))
        item.base_inr = Decimal(str(raw["base_inr"]))
        if item.sku not in existing:
            db.add(item)
            await db.flush()
        prices = {p.country_code: p for p in (await db.execute(select(CataloguePrice).where(CataloguePrice.item_id == item.id))).scalars().all()}
        for c in countries:
            amount = shop_price(float(raw["base_inr"]) * DEMO_FACTOR.get(c.currency, 0))
            p = prices.get(c.code) or CataloguePrice(item_id=item.id, country_code=c.code)
            p.currency, p.amount, p.in_stock = c.currency, amount, True
            if c.code not in prices:
                db.add(p)
    await db.commit()
    return len(data["items"])
