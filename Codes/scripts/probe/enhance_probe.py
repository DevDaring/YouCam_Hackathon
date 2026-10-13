#!/usr/bin/env python3
"""Probe: YouCam AI Photo Enhance (2 units) + NanoGPT clarity upscaler fallback ($0.20). Saves raw responses as fixtures."""
import asyncio, base64, io, json, sys, time
from pathlib import Path
import httpx
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.config import get_settings  # noqa: E402
from app.youcam.client import YouCamClient  # noqa: E402
OUT = ROOT / "fixtures" / "youcam" / "probe"
SRC = ROOT / "fixtures/youcam/probe/render/chain_demo_bride_4_hair.jpg"

def redact(j):
    s = json.dumps(j)
    return json.loads(s) if len(s) < 4000 else {"_truncated": s[:1500]}

async def youcam():
    c = YouCamClient(account=2)
    data = SRC.read_bytes(); t = time.time()
    fid = await c.upload_file(data)
    r = await c._http.post("/s2s/v2.0/task/enhance", json={"src_file_id": fid, "scale": 1})
    create = r.json(); print("youcam create", r.status_code, create)
    tid = create["data"]["task_id"]
    while True:
        await asyncio.sleep(4)
        p = (await c._http.get(f"/s2s/v2.0/task/enhance/{tid}")).json()
        if p["data"]["task_status"] != "running": break
    print("youcam poll", json.dumps(p)[:400], f"{time.time()-t:.0f}s")
    (OUT / "enhance_create.json").write_text(json.dumps(create, indent=1)); (OUT / "enhance_poll.json").write_text(json.dumps(p, indent=1))
    if p["data"].get("results", {}).get("url"):
        (OUT / "enhance_youcam.jpg").write_bytes(await c.download(p["data"]["results"]["url"]))
    await c.aclose()

def nanogpt():
    s = get_settings()
    im = Image.open(SRC).convert("RGB"); im.thumbnail((768, 768)); b = io.BytesIO(); im.save(b, "JPEG", quality=90)
    url = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    t = time.time()
    r = httpx.post("https://nano-gpt.com/api/v1/images", headers={"Authorization": f"Bearer {s.NANOGPT_API_KEY}"}, timeout=240,
                   json={"model": "clarity-ai-flux-upscaler", "prompt": "Enhance and sharpen this photo; keep the person, outfit, jewellery and colours exactly the same.",
                         "input_references": [url], "n": 1})
    j = r.json(); print("nanogpt", r.status_code, f"{time.time()-t:.0f}s", json.dumps(redact(j))[:700])
    (OUT / "nanogpt_enhance_response.json").write_text(json.dumps(redact(j), indent=1))
    return j

if __name__ == "__main__":
    which = sys.argv[1:] or ["youcam", "nanogpt"]
    if "youcam" in which: asyncio.run(youcam())
    if "nanogpt" in which: nanogpt()
