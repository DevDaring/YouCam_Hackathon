"""Deterministic look planner: three distinct looks for a session from the real catalogue.

Scores are simple and explainable: event match, style match, weight harmony, budget fit.
No LLM involved (spec §2: measurement over opinion)."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.looks.presets import LAYERS_BY_WEAR, SLOT_PRESETS
from app.models import CatalogueItem, Session

WEIGHT = {"light": 0, "medium": 1, "heavy": 2}


@dataclass
class PlannedLook:
    slot: int
    preset: str
    outfit: CatalogueItem
    necklace: CatalogueItem | None = None
    earrings: CatalogueItem | None = None
    layers: list[str] = field(default_factory=list)


def wear_for(session: Session) -> str | None:
    if session.wear in ("women", "men"):
        return session.wear
    return {"bride": "women", "groom": "men"}.get(session.role)


def _score(item: CatalogueItem, session: Session) -> float:
    tags = set(item.event_tags or [])
    s = 3.0 if session.event_type in tags else 0.0
    s += sum(1.0 for st in session.style_tags or [] if st in tags)
    return s


def plan(session: Session, items: list[CatalogueItem], prices: dict, wear: str) -> list[PlannedLook]:
    """prices: {item_id: Decimal} for the session's country."""
    budget = session.budget_amount
    pool = [i for i in items if i.wear in (wear, "any") and i.id in prices]
    outfits = sorted((i for i in pool if i.category == "outfit"),
                     key=lambda i: (-_score(i, session), prices[i.id]))
    necklaces = [i for i in pool if i.category == "necklace"]
    earrings = [i for i in pool if i.category == "earrings"]
    looks: list[PlannedLook] = []
    used_n: set = set()
    used_e: set = set()
    for slot, outfit in enumerate(outfits[:3], start=1):
        look = PlannedLook(slot=slot, preset=SLOT_PRESETS[slot - 1], outfit=outfit, layers=list(LAYERS_BY_WEAR[wear]))
        if wear == "women" and necklaces and earrings:
            ow = WEIGHT.get(outfit.weight_class or "medium", 1)
            def jscore(j: CatalogueItem, used: set) -> tuple:
                fit = -abs(WEIGHT.get(j.weight_class or "medium", 1) - ow)
                return (j.id in used, -(_score(j, session) + fit), prices[j.id])
            look.necklace = sorted(necklaces, key=lambda j: jscore(j, used_n))[0]
            same_metal = [e for e in earrings if e.metal == look.necklace.metal] or earrings
            look.earrings = sorted(same_metal, key=lambda j: jscore(j, used_e))[0]
            # Over budget? swap in the cheapest jewellery that keeps the metal.
            if budget is not None and _total(look, prices) > budget:
                look.necklace = min((n for n in necklaces if n.metal == look.necklace.metal), key=lambda j: prices[j.id])
                look.earrings = min((e for e in earrings if e.metal == look.necklace.metal), key=lambda j: prices[j.id], default=look.earrings)
            used_n.add(look.necklace.id)
            used_e.add(look.earrings.id)
        looks.append(look)
    return looks


def _total(look: PlannedLook, prices: dict) -> Decimal:
    return sum((prices[i.id] for i in (look.outfit, look.necklace, look.earrings) if i is not None), Decimal(0))
