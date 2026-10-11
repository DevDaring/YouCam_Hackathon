"""Makeup moods and hairstyles for the three look slots. Pattern labels come from YouCam's
pattern catalogs (plugins-media.makeupar.com/wcm-saas/patterns/*.json); hair template ids from
GET /s2s/v2.1/task/template/hair-transfer (fixtures/youcam/hair_templates.json). All hair
templates chosen keep the wearer's own hair colour."""
from __future__ import annotations


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


PRESETS = {
    "sindoor_dusk": {
        "makeup": _makeup("#9E1B32", "matte", "#C25A5A", "#6B3A2E"), "lip": "#9E1B32",
        "hair": {"women": "female_sleek_middle_part", "men": "male_textured_comma"},
    },
    "marigold_morning": {
        "makeup": _makeup("#D9654B", "gloss", "#E8916F", "#C98A3A"), "lip": "#D9654B",
        "hair": {"women": "all_half_up_soft_waves", "men": "male_tousled_cut"},
    },
    "ivory_moon": {
        "makeup": _makeup("#B5656B", "matte", "#D79A9A", "#8E6B5C"), "lip": "#B5656B",
        "hair": {"women": "all_classic_hollywood_waves", "men": "all_tousled_waves"},
    },
}
SLOT_PRESETS = ["sindoor_dusk", "marigold_morning", "ivory_moon"]

# Render order (spec K1). Men's looks skip jewellery and makeup layers.
LAYERS_BY_WEAR = {
    "women": ["outfit", "necklace", "earrings", "makeup", "hair"],
    "men": ["outfit", "hair"],
}
