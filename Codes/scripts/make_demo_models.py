#!/usr/bin/env python3
"""Generate two AI demo shoppers (clearly labelled AI-generated) for the live render probe and demo mode."""
import asyncio, io, json, sys
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.imagegen import generate  # noqa: E402

NEG = "multiple people, cropped feet, cropped head, sunglasses, hat, text, watermark, blurry, distorted body, extra limbs"
MODELS = {
    "demo_bride": "Full-length studio photograph of a young South Asian woman standing straight and facing the camera, arms relaxed at her sides, "
                  "wearing a simple plain white cotton kurta and white leggings, hair tied back neatly, natural makeup, friendly calm expression, "
                  "whole body visible from head to feet, plain light grey studio background, soft even daylight, sharp focus, photorealistic",
    "demo_groom": "Full-length studio photograph of a young South Asian man standing straight and facing the camera, arms relaxed at his sides, "
                  "wearing a plain white cotton kurta and white trousers, short neat hair, clean shaven, friendly calm expression, "
                  "whole body visible from head to feet, plain light grey studio background, soft even daylight, sharp focus, photorealistic",
}

async def one(name, prompt):
    out = ROOT / "seed" / "demo" / f"{name}.jpg"
    if out.exists():
        return name, "exists"
    g = await generate(prompt, NEG, "3:4")
    Image.open(io.BytesIO(g.data)).convert("RGB").save(out, "JPEG", quality=92)
    return name, g.provider

async def main():
    res = await asyncio.gather(*(one(n, p) for n, p in MODELS.items()))
    meta = {n: {"provider": p, "licence": "AI-generated person (not a real individual); YouCam AI Image Generator V2 unless noted"} for n, p in res}
    (ROOT / "seed" / "demo" / "demo_models.json").write_text(json.dumps(meta, indent=1))
    print(res)

asyncio.run(main())
