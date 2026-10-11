#!/usr/bin/env python3
"""Generate the AI demo catalogue images (YouCam first, NanoGPT fallbacks) and write
seed/catalogue/catalogue.json with provider, licence label and measured dominant colour (CIELAB).
Idempotent: images that already exist are kept. Usage: backend/.venv/bin/python scripts/build_catalogue.py
"""
import asyncio
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.imagegen import ImageGenError, generate  # noqa: E402

CAT = ROOT / "seed" / "catalogue"
IMG = CAT / "images"
CONCURRENCY = 2  # one image job per YouCam account at a time (imagegen pool)


def dominant_lab(data: bytes) -> list[float]:
    """k-means (k=3) in CIELAB over non-background pixels; returns the largest cluster centre."""
    import cv2
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((256, 256))
    lab = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    L, a, b = lab[:, 0] * 100 / 255, lab[:, 1] - 128, lab[:, 2] - 128
    keep = ~((L > 88) & (np.abs(a) < 6) & (np.abs(b) < 6))  # drop white / light-grey background
    pts = np.stack([L, a, b], 1)[keep]
    if len(pts) < 50:
        pts = np.stack([L, a, b], 1)
    _, labels, centres = cv2.kmeans(pts.astype(np.float32), 3, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    c = centres[np.bincount(labels.ravel()).argmax()]
    return [round(float(x), 2) for x in c]


async def main() -> None:
    spec = json.loads((CAT / "items.json").read_text(encoding="utf-8"))
    out_path = CAT / "catalogue.json"
    meta = {i["sku"]: i for i in json.loads(out_path.read_text())["items"]} if out_path.exists() else {}
    sem = asyncio.Semaphore(CONCURRENCY)
    failures = []

    async def one(item: dict) -> None:
        path = IMG / f"{item['sku']}.jpg"
        if not path.exists():
            async with sem:
                print(f"  generating {item['sku']}…", flush=True)
                try:
                    g = await generate(item["prompt"], spec["negative_prompt"], "3:4" if item["category"] == "outfit" else "1:1")
                except ImageGenError as e:
                    failures.append(f"{item['sku']}: {e}")
                    return
                im = Image.open(io.BytesIO(g.data)).convert("RGB")
                im.save(path, "JPEG", quality=92)
                meta[item["sku"]] = {"provider": g.provider, "model": g.model}
                print(f"  ✓ {item['sku']} via {g.provider}", flush=True)
        m = meta.setdefault(item["sku"], {"provider": "youcam", "model": "youcam-image-v2"})
        m.update({k: v for k, v in item.items() if k != "prompt"})
        m["image"] = f"images/{item['sku']}.jpg"
        m["colour_lab"] = dominant_lab(path.read_bytes())
        m["licence"] = f"AI-generated ({'YouCam AI Image Generator V2' if m['provider'] == 'youcam' else 'NanoGPT ' + m['model']})"
        m["is_ai_generated"] = True

    await asyncio.gather(*(one(i) for i in spec["items"]))
    items = [meta[i["sku"]] for i in spec["items"] if i["sku"] in meta and "image" in meta[i["sku"]]]
    out_path.write_text(json.dumps({"store": spec["store"], "items": items}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"catalogue.json: {len(items)} items; failures: {failures or 'none'}")


asyncio.run(main())
