#!/usr/bin/env python3
"""One-off: detect people in full photos uploaded before multi-person support, and auto-match the
face close-up where one exists. Safe to re-run. Run with the backend venv of the target environment:
  /home/Debz/Host/dearyou/backend/.venv/bin/python scripts/backfill_people.py   (production, reads its .env)
"""
import asyncio
import io
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import storage  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.integrity import people  # noqa: E402
from app.models import Photo  # noqa: E402


async def main() -> None:
    async with SessionLocal() as db:
        fulls = (await db.execute(select(Photo).where(Photo.kind == "full"))).scalars().all()
        for p in fulls:
            q = dict(p.quality_json or {})
            if "people" in q:
                continue
            rgb = np.asarray(Image.open(io.BytesIO(storage.read(p.storage_path))).convert("RGB"))
            ppl = people.detect_people(rgb)
            if len(ppl) < 2:
                q["people"] = []
                p.quality_json = q
                continue
            q.update(people=ppl, target=None, target_source=None)
            face = (await db.execute(select(Photo).where(Photo.session_id == p.session_id, Photo.kind == "face"))).scalar_one_or_none()
            if face is not None:
                fr = np.asarray(Image.open(io.BytesIO(storage.read(face.storage_path))).convert("RGB"))
                idx, scores = people.match(fr, rgb, ppl)
                q.update(target=idx, target_source="match" if idx is not None else None, match_scores=scores)
            p.quality_json = q
            print(f"session {p.session_id}: {len(ppl)} people, target={q.get('target')} scores={q.get('match_scores')}")
        await db.commit()
    print(f"checked {len(fulls)} full photos")


asyncio.run(main())
