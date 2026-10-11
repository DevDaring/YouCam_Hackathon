#!/usr/bin/env python3
"""Live render probe (spec §7.3 garment probe + full layer chain). Spends real units via the ledger.

1. Every catalogue outfit on the matching AI demo model (cloth-v4, 2 units each) → drape check.
2. One complete bride look (outfit → necklace → earrings → makeup → hair) and one groom look
   (outfit → hair) through the same crop/blend code the app uses.
Writes fixtures/youcam/probe/render/* and docs/probe_results.md.
Usage: backend/.venv/bin/python scripts/probe/render_probe.py [--outfits] [--chain]
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ["MOCK_MODE"] = "false"

from PIL import Image  # noqa: E402

from app import storage  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.looks import compose  # noqa: E402
from app.looks.presets import PRESETS  # noqa: E402
from app.looks.render import EARRING_PARAMS, NECKLACE_PARAMS  # noqa: E402
from app.youcam import service  # noqa: E402
from app.youcam.client import YouCamError  # noqa: E402
from app.youcam.service import get_credit_balance  # noqa: E402

CAT = ROOT / "seed" / "catalogue"
OUT = ROOT / "fixtures" / "youcam" / "probe" / "render"
DEMO = ROOT / "seed" / "demo"
SEM = asyncio.Semaphore(4)


def items() -> dict:
    return {i["sku"]: i for i in json.loads((CAT / "catalogue.json").read_text())["items"]}


def load(p: Path) -> Image.Image:
    return Image.open(p).convert("RGB")


async def outfit(model: str, sku: str, it: dict) -> dict:
    src = compose.to_jpeg(load(DEMO / f"{model}.jpg"))
    t = time.monotonic()
    async with SEM, SessionLocal() as db:
        try:
            r = await service.try_on_cloth(db, src, (CAT / it["image"]).read_bytes(), it.get("garment_category", "full_body"))
            out = OUT / f"outfit_{model}_{sku}.jpg"
            out.write_bytes(storage.read(r.image_path))
            return {"sku": sku, "name": it["name"], "model": model, "status": "rendered", "file": str(out.relative_to(ROOT)), "s": round(time.monotonic() - t)}
        except YouCamError as e:
            return {"sku": sku, "name": it["name"], "model": model, "status": "failed", "error": e.code, "s": round(time.monotonic() - t)}


async def chain(model: str, wear: str, outfit_sku: str, neck: str | None, ear: str | None, preset: str) -> list[dict]:
    cat = items()
    current = load(DEMO / f"{model}.jpg")
    steps = [("outfit", outfit_sku)] + ([("necklace", neck), ("earrings", ear), ("makeup", None)] if wear == "women" else []) + [("hair", None)]
    log = []
    for layer, sku in steps:
        t = time.monotonic()
        try:
            async with SessionLocal() as db:
                if layer == "outfit":
                    r = await service.try_on_cloth(db, compose.to_jpeg(current), (CAT / cat[sku]["image"]).read_bytes(), "full_body")
                    current = Image.open(io.BytesIO(storage.read(r.image_path))).convert("RGB")
                else:
                    sent, crop = compose.prepare(current, layer)
                    if layer == "necklace":
                        r = await service.try_on_necklace(db, sent, (CAT / cat[sku]["image"]).read_bytes(), NECKLACE_PARAMS)
                    elif layer == "earrings":
                        r = await service.try_on_earrings(db, sent, (CAT / cat[sku]["image"]).read_bytes(), EARRING_PARAMS)
                    elif layer == "makeup":
                        r = await service.apply_makeup(db, sent, PRESETS[preset]["makeup"])
                    else:
                        r = await service.apply_hairstyle(db, sent, PRESETS[preset]["hair"][wear])
                    current = compose.blend_back(current, storage.read(r.image_path), crop)
            out = OUT / f"chain_{model}_{len(log)}_{layer}.jpg"
            current.save(out, "JPEG", quality=90)
            log.append({"layer": layer, "sku": sku, "status": "rendered", "file": str(out.relative_to(ROOT)), "s": round(time.monotonic() - t)})
        except (YouCamError, compose.NoFace) as e:
            log.append({"layer": layer, "sku": sku, "status": "failed", "error": getattr(e, "code", str(e)), "s": round(time.monotonic() - t)})
        print(f"  {model} {layer:9} {log[-1]['status']} {log[-1].get('error', '')} {log[-1]['s']}s", flush=True)
    return log


async def main(do_outfits: bool, do_chain: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    before = await get_credit_balance()
    report = {"balance_before": before}
    if do_outfits:
        cat = items()
        jobs = [outfit("demo_bride" if it["wear"] == "women" else "demo_groom", sku, it) for sku, it in cat.items() if it["category"] == "outfit"]
        report["outfits"] = await asyncio.gather(*jobs)
        for o in report["outfits"]:
            print(f"  {o['sku']:12} {o['status']:9} {o.get('error', '')} {o['s']}s", flush=True)
    if do_chain:
        report["bride_chain"], report["groom_chain"] = await asyncio.gather(
            chain("demo_bride", "women", "OUT-SAR-RED", "NEC-TMP-GLD", "EAR-JHM-GLD", "sindoor_dusk"),
            chain("demo_groom", "men", "OUT-SHW-IVR", None, None, "sindoor_dusk"))
    report["balance_after"] = await get_credit_balance()
    (OUT / "probe_run.json").write_text(json.dumps(report, indent=1))
    write_md(report)
    print(f"units: {before} → {report['balance_after']}")


def write_md(r: dict) -> None:
    L = ["# Render probe results (spec §7.3)", "",
         f"Live YouCam run, {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}. Units: {r['balance_before']:g} → {r['balance_after']:g}.",
         "Demo shoppers are **AI-generated people** (YouCam AI Image Generator), not real individuals. "
         "`rendered` = the API returned an image; drape quality is judged by eye in the table.", ""]
    if r.get("outfits"):
        L += ["## Garments (Clothes VTO V4, `full_body`)", "", "| Garment | Model | API | Time | Render | Drape (human) |", "|---|---|---|---|---|---|"]
        for o in r["outfits"]:
            img = f"![{o['sku']}](../{o['file']})" if o.get("file") else o.get("error", "")
            L.append(f"| {o['name']} | {o['model']} | {o['status']} | {o['s']}s | {img} | _review_ |")
    for key in ("bride_chain", "groom_chain"):
        if r.get(key):
            L += ["", f"## {key.replace('_', ' ').title()}", "", "| Step | Layer | Result | Time | Image |", "|---|---|---|---|---|"]
            for i, s in enumerate(r[key]):
                img = f"![{s['layer']}](../{s['file']})" if s.get("file") else s.get("error", "")
                L.append(f"| {i + 1} | {s['layer']} | {s['status']} | {s['s']}s | {img} |")
    (ROOT / "docs" / "probe_results.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outfits", action="store_true")
    ap.add_argument("--chain", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.outfits or not a.chain, a.chain or not a.outfits))
