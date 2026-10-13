"""Makeup moods and hairstyles for the three look slots. Pattern labels come from YouCam's
pattern catalogs (plugins-media.makeupar.com/wcm-saas/patterns/*.json); hair template ids from
GET /s2s/v2.1/task/template/hair-transfer (fixtures/youcam/hair_templates.json). All hair
templates chosen keep the wearer's own hair colour."""
from __future__ import annotations

import json
from functools import lru_cache

from app.config import ROOT_DIR

# Lipstick shades users can pick in the editor (names are UI keys, translated in the frontend).
LIP_SHADES = {
    "classic_red": "#B0122B", "deep_berry": "#7A1F3D", "brick": "#A0412D", "coral": "#D9654B",
    "rose_nude": "#B5656B", "mauve": "#9C5B6E", "terracotta": "#B4553A", "plum": "#6E2A4A",
    "rose_pink": "#D45D79", "peach_nude": "#C98B73",
}


def _makeup(lip: str, lip_texture: str, blush: str, shadow: str) -> list[dict]:
    lip_palette = {"color": lip, "texture": lip_texture, "colorIntensity": 70}
    if lip_texture == "gloss":
        # Schema: gloss needs both `gloss` and `transparencyIntensity` (live invalid_parameter without it).
        lip_palette["gloss"] = 60
        lip_palette["transparencyIntensity"] = 30
    return [
        {"category": "skin_smooth", "skinSmoothStrength": 30, "skinSmoothColorIntensity": 30},
        {"category": "blush", "pattern": {"name": "1color1"}, "palettes": [{"color": blush, "texture": "matte", "colorIntensity": 35}]},
        {"category": "eye_shadow", "pattern": {"name": "1color1"}, "palettes": [{"color": shadow, "texture": "matte", "colorIntensity": 40}]},
        {"category": "lip_color", "shape": {"name": "original"}, "style": {"type": "full"}, "palettes": [lip_palette]},
    ]


MOODS = {  # lip, lip texture, blush, eye shadow
    "sindoor_dusk": ("#9E1B32", "matte", "#C25A5A", "#6B3A2E"),
    "marigold_morning": ("#D9654B", "gloss", "#E8916F", "#C98A3A"),
    "ivory_moon": ("#B5656B", "matte", "#D79A9A", "#8E6B5C"),
}
HAIR_DEFAULTS = {
    "sindoor_dusk": {"women": "female_sleek_middle_part", "men": "male_textured_comma"},
    "marigold_morning": {"women": "all_half_up_soft_waves", "men": "male_tousled_cut"},
    "ivory_moon": {"women": "all_classic_hollywood_waves", "men": "all_tousled_waves"},
}


def build_makeup(preset: str, lip: str | None = None) -> list[dict]:
    m_lip, texture, blush, shadow = MOODS[preset]
    return _makeup(lip or m_lip, texture, blush, shadow)


PRESETS = {k: {"makeup": build_makeup(k), "lip": MOODS[k][0], "hair": HAIR_DEFAULTS[k]} for k in MOODS}


@lru_cache
def hair_templates(wear: str) -> list[dict]:
    """YouCam V2.1 hairstyle templates (fixtures/youcam/hair_templates.json, fetched live, free).
    Women: Female templates that keep the wearer's own hair colour. Men: all Male templates."""
    data = json.loads((ROOT_DIR / "fixtures" / "youcam" / "hair_templates.json").read_text())["templates"]
    if wear == "men":
        picked = [t for t in data if t.get("category_name") == "Male" and t["id"] != "male_bald"]
    else:
        picked = [t for t in data if t.get("category_name") == "Female" and t.get("keep_users_color")]
    return [{"template_id": t["id"], "title": t["title"], "thumb": t["thumb"]} for t in picked]
SLOT_PRESETS = ["sindoor_dusk", "marigold_morning", "ivory_moon"]

# Render order (spec K1). Men's looks skip jewellery and makeup layers.
LAYERS_BY_WEAR = {
    "women": ["outfit", "necklace", "earrings", "makeup", "hair"],
    "men": ["outfit", "hair"],
}
