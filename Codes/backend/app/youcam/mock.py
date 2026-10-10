"""Mock mode (spec §7.7): zero YouCam calls, realistic delays.

JSON features return the documented example responses in fixtures/youcam/.
Image features return a captured real render from fixtures/youcam/renders/<feature>/ when one
exists; otherwise a clearly labelled synthetic preview built from the source photo.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import random

from PIL import Image, ImageDraw, ImageOps

from app.config import ROOT_DIR
from app.youcam.client import TaskResult

FIXTURES = ROOT_DIR / "fixtures" / "youcam"

JSON_FIXTURES = {
    "skin_analysis": FIXTURES / "docs_examples" / "skin_analysis_poll_json.json",
    "skin_tone": FIXTURES / "docs_examples" / "skin_tone_poll.json",
    "fitzpatrick": FIXTURES / "schema_derived" / "fitzpatrick_poll.json",
    "face": FIXTURES / "schema_derived" / "face_analyzer_poll.json",
}

MOCK_DELAY = {"cloth": 2.2, "necklace": 1.2, "earrings": 1.0, "makeup": 1.0, "look": 1.4, "hairstyle": 1.8,
              "skin_analysis": 1.6, "skin_tone": 1.2, "fitzpatrick": 0.9, "face": 1.0, "skin_simulation": 1.4,
              "makeup_transfer": 1.4}

# Visible, distinct tints so each layer is identifiable in mock renders.
TINTS = {"cloth": (122, 31, 51), "necklace": (201, 162, 77), "earrings": (242, 169, 59), "makeup": (179, 54, 74),
         "look": (179, 54, 74), "hairstyle": (74, 14, 28), "skin_simulation": (243, 230, 211), "makeup_transfer": (179, 54, 74)}


def _delay_scale() -> float:
    return float(os.environ.get("MOCK_DELAY_SCALE", "1"))


def _load_example(path) -> dict:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get("example", doc)


def synthetic_render(feature: str, src: bytes) -> bytes:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(src))).convert("RGB")
    img.thumbnail((1024, 1024))
    overlay = Image.new("RGB", img.size, TINTS.get(feature, (242, 169, 59)))
    out = Image.blend(img, overlay, 0.18)
    d = ImageDraw.Draw(out)
    label = f"MOCK · {feature}"
    pad = max(8, img.width // 60)
    d.rectangle([0, 0, img.width, pad * 4], fill=(30, 20, 22))
    d.text((pad, pad), label, fill=(248, 207, 134))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def captured_render(feature: str) -> bytes | None:
    d = FIXTURES / "renders" / feature
    if not d.is_dir():
        return None
    files = sorted(p for p in d.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    return random.choice(files).read_bytes() if files else None


async def run(feature: str, src: bytes) -> tuple[TaskResult, bytes | None]:
    await asyncio.sleep(MOCK_DELAY.get(feature, 1.0) * _delay_scale() * random.uniform(0.8, 1.2))
    if feature in JSON_FIXTURES:
        data = _load_example(JSON_FIXTURES[feature])["data"]
        return TaskResult(status="success", results=data.get("results") or {}, raw={"mock": True}), None
    image = captured_render(feature) or synthetic_render(feature, src)
    return TaskResult(status="success", url=None, results={"mock": True}, raw={"mock": True}), image
