#!/usr/bin/env python3
"""Day-1 feasibility probe (spec §7.3): Clothes VTO (cloth-v4) on ONE shopper photo with up to 10
South Asian garments. Saves outputs to fixtures/youcam/probe/ and writes docs/probe_results.md.

Inputs (git-ignored, your own / AI-generated / openly licensed images only):
  scripts/probe/inputs/shopper.jpg            full-length, one person, standing, facing forward
  scripts/probe/inputs/garments/manifest.json [{"file": "saree_red.png", "type": "saree",
                                                "garment_category": "full_body", "licence": "AI-generated (Gemini)"}]

Usage (from repo root, with the backend venv):
  backend/.venv/bin/python scripts/probe/garment_probe.py            # dry run: checks inputs, balance, cost
  backend/.venv/bin/python scripts/probe/garment_probe.py --yes      # spends 2 units per garment
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ["MOCK_MODE"] = "false"  # the probe is a live check by definition

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.ledger import ledger  # noqa: E402
from app import storage  # noqa: E402
from app.youcam import service  # noqa: E402
from app.youcam.client import YouCamError  # noqa: E402
from app.youcam.features import FEATURES, GARMENT_CATEGORIES  # noqa: E402

INPUTS = ROOT / "scripts" / "probe" / "inputs"
OUT = ROOT / "fixtures" / "youcam" / "probe"
RENDERS = ROOT / "fixtures" / "youcam" / "renders" / "cloth"  # reused by mock mode
REPORT = ROOT / "docs" / "probe_results.md"
MAX_GARMENTS = 10


def load_inputs() -> tuple[bytes, list[dict]]:
    shopper = next((INPUTS / n for n in ("shopper.jpg", "shopper.jpeg", "shopper.png") if (INPUTS / n).exists()), None)
    manifest = INPUTS / "garments" / "manifest.json"
    problems = []
    if shopper is None:
        problems.append(f"missing {INPUTS}/shopper.jpg (your own full-length photo)")
    if not manifest.exists():
        problems.append(f"missing {manifest}")
    if problems:
        sys.exit("Probe inputs not ready:\n  - " + "\n  - ".join(problems))
    garments = json.loads(manifest.read_text(encoding="utf-8"))[:MAX_GARMENTS]
    for g in garments:
        if g["garment_category"] not in GARMENT_CATEGORIES:
            sys.exit(f"{g['file']}: garment_category must be one of {GARMENT_CATEGORIES}")
        if not (INPUTS / "garments" / g["file"]).exists():
            sys.exit(f"missing garment image {g['file']}")
    return shopper.read_bytes(), garments


async def main(yes: bool) -> None:
    s = get_settings()
    src, garments = load_inputs()
    cost = FEATURES["cloth"].units({}) * len(garments)
    balance = await service.get_credit_balance()
    async with SessionLocal() as db:
        spent = await ledger.units_spent(db)
    print(f"Garments: {len(garments)} · cost {cost} units · account balance {balance:g} · "
          f"ledger spent {spent}/{s.youcam_spendable_units} spendable (reserve {s.YOUCAM_UNIT_RESERVE})")
    if balance < cost:
        sys.exit(f"Account balance {balance:g} < {cost} needed. Add units in the YouCam API console first.")
    if not yes:
        print("Dry run only. Re-run with --yes to spend the units.")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    RENDERS.mkdir(parents=True, exist_ok=True)
    rows = []
    for g in garments:
        t0 = time.monotonic()
        garment = (INPUTS / "garments" / g["file"]).read_bytes()
        row = {**g, "status": "", "error": "", "seconds": 0.0, "output": ""}
        try:
            async with SessionLocal() as db:
                r = await service.try_on_cloth(db, src, garment, g["garment_category"])
            out = OUT / f"{Path(g['file']).stem}__{g['garment_category']}.jpg"
            out.write_bytes(storage.read(r.image_path))
            shutil.copy(out, RENDERS / out.name)
            row.update(status="rendered", output=str(out.relative_to(ROOT)), cache_hit=r.cache_hit)
        except YouCamError as e:
            row.update(status="failed", error=f"{e.code}: {e.message}"[:200])
        except ledger.BudgetExceeded as e:
            row.update(status="refused", error=str(e))
            rows.append(row)
            break
        row["seconds"] = round(time.monotonic() - t0, 1)
        rows.append(row)
        print(f"  {g['file']:<32} {row['status']:<9} {row['seconds']:>5}s {row['error']}")

    (OUT / "probe_run.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    write_report(rows, balance)


def write_report(rows: list[dict], balance_before: float) -> None:
    lines = [
        "# Garment probe results (spec §7.3)",
        "",
        f"Run: {time.strftime('%Y-%m-%d %H:%M %Z')} · feature `cloth-v4` (2 units each) · balance before {balance_before:g}",
        "",
        "`rendered` means the API returned an image. **Drape quality (Pass/Fail) is a human judgement.** "
        "Fill in the last column after looking at each render.",
        "",
        "| Garment | Type | Category | API status | Time | Render | Drape: Pass/Fail (human) |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        img = f"![{r['type']}](../{r['output']})" if r["output"] else r["error"]
        lines.append(f"| {r['file']} | {r['type']} | {r['garment_category']} | {r['status']} | {r['seconds']}s | {img} | _review_ |")
    lines += ["", "Fallback rule: if sarees or lehengas fail to drape, outfits are limited to the categories that pass, "
              "and jewellery and makeup become the visual hero."]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="actually spend units")
    asyncio.run(main(ap.parse_args().yes))
