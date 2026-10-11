#!/usr/bin/env python3
"""One live text-to-image call (1 unit) to capture the real create/poll responses as fixtures."""
import asyncio, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.youcam.client import YouCamClient  # noqa: E402

PROMPT = ("Studio product photograph of a single red Banarasi silk bridal saree with gold zari border, "
          "displayed flat on an invisible mannequin, front view, full garment visible, plain white background, "
          "soft even lighting, e-commerce catalogue style, no person, no face")
NEG = "person, face, hands, model, text, watermark, logo, cropped, blurry, low quality"

async def main():
    c = YouCamClient()
    before = await c.get_credit_balance()
    t = time.time()
    task = await c._http.post("/s2s/v2.0/task/text-to-image/youcam", json={"model": "youcam-image-v2", "prompt": PROMPT, "negative_prompt": NEG, "size": "1104*1472", "prompt_extend": False})
    create = task.json(); print("create", task.status_code, create)
    tid = create["data"]["task_id"]
    while True:
        await asyncio.sleep(3)
        r = await c._http.get(f"/s2s/v2.0/task/text-to-image/youcam/{tid}")
        poll = r.json(); st = poll.get("data", {}).get("task_status")
        if st in ("success", "error"): break
    print("poll", json.dumps(poll)[:600], f"{time.time()-t:.0f}s")
    out = ROOT / "fixtures/youcam/probe"
    (out / "imagegen_create.json").write_text(json.dumps(create, indent=2))
    (out / "imagegen_poll.json").write_text(json.dumps(poll, indent=2))
    res = poll["data"].get("results")
    url = res.get("url") if isinstance(res, dict) else (res[0].get("url") if isinstance(res, list) else res)
    if url:
        (out / "imagegen_saree.jpg").write_bytes(await c.download(url))
    print("balance before", before, "after", await c.get_credit_balance())
    await c.aclose()

asyncio.run(main())
