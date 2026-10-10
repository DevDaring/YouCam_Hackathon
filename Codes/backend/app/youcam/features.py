"""YouCam feature registry — the ONLY place that knows slugs, versions and unit prices.

Every value here is confirmed in docs/API_NOTES.md (official OpenAPI bundles + the live
feature-cost list in fixtures/youcam/feature_cost.json, captured 2026-10-10).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    key: str            # our name
    version: str        # path version, e.g. "v2.0"
    slug: str           # task slug, e.g. "cloth-v4"
    returns_image: bool
    units: Callable[[dict], int]  # params -> units charged on success

    @property
    def task_path(self) -> str:
        return f"/s2s/{self.version}/task/{self.slug}"


def _tier(n: int, tiers: list[tuple[int, int]]) -> int:
    for upper, units in tiers:
        if n <= upper:
            return units
    raise ValueError(f"{n} exceeds the largest tier")


def _skin_analysis_units(p: dict) -> int:
    actions = p.get("dst_actions") or []
    hd = any(a.startswith("hd_") for a in actions)
    tiers = [(4, 12), (8, 16), (12, 20), (16, 22)] if hd else [(4, 9), (8, 12), (12, 14), (16, 16)]
    return _tier(max(1, len(actions)), tiers)


def _skin_sim_units(p: dict) -> int:
    n = sum(1 for k, v in p.items() if k in SKIN_SIM_SLIDERS and v)
    return 4 if n <= 4 else 6


def _face_units(p: dict) -> int:
    return _tier(max(1, len(p.get("features") or [])), [(5, 10), (14, 20), (28, 30)])


SKIN_SIM_SLIDERS = ("wrinkle", "radiance", "oiliness", "acne", "eye_bags", "dark_circle", "spots", "pores", "texture", "redness")
GARMENT_CATEGORIES = ("full_body", "lower_body", "upper_body", "shoes", "auto", "outer")

FEATURES: dict[str, Feature] = {f.key: f for f in [
    Feature("cloth", "v2.0", "cloth-v4", True, lambda p: 2),
    Feature("necklace", "v2.0", "2d-vto/necklace", True, lambda p: 1),
    Feature("earrings", "v2.0", "2d-vto/earring", True, lambda p: 2 if len(p.get("object_infos") or []) > 1 else 1),
    Feature("makeup", "v2.0", "makeup-vto", True, lambda p: 1),
    Feature("look", "v2.0", "look-vto", True, lambda p: 2),
    Feature("makeup_transfer", "v2.0", "mu-transfer", True, lambda p: 2),
    Feature("hairstyle", "v2.1", "hair-transfer", True, lambda p: 2),
    Feature("skin_analysis", "v2.1", "skin-analysis", False, _skin_analysis_units),
    Feature("skin_simulation", "v2.0", "skin-simulation", True, _skin_sim_units),
    Feature("skin_tone", "v2.0", "skin-tone-analysis", False, lambda p: 20),
    Feature("fitzpatrick", "v2.0", "fitzpatrick-scale-analyzer", False, lambda p: 10),
    Feature("face", "v2.0", "face-attr-analysis", False, _face_units),
]}

# Free GET template lists (not in the price list — Unverified as free, see API_NOTES §4)
TEMPLATE_PATHS = {
    "look": "/s2s/v2.0/task/template/look-vto",
    "hairstyle": "/s2s/v2.1/task/template/hair-transfer",
}

FILE_PATH = "/s2s/v2.0/file"
CREDIT_PATH = "/s2s/v1.0/client/credit"
