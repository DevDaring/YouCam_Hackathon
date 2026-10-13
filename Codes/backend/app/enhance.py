"""Photo enhancement (sharpen / de-blur / clarity): YouCam AI Photo Enhance first (2 units),
NanoGPT 'clarity-ai-flux-upscaler' as fallback (owner rule D-010: YouCam primary).

Shapes from live probes (fixtures/youcam/probe/enhance_*.json, nanogpt_enhance_response.json):
YouCam POST /s2s/v2.0/task/enhance {src_file_id, scale} → poll data.results.url;
NanoGPT POST /api/v1/images {model, prompt, input_references:[data URL]} → data[0].url.
"""
from __future__ import annotations

import base64
import io
import logging
import uuid

import httpx
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.config import get_settings
from app.ledger import ledger
from app.youcam import service
from app.youcam.client import YouCamError

log = logging.getLogger("dearyou.enhance")
NANO_MODEL = "clarity-ai-flux-upscaler"
MAX_SIDE = 2048


class EnhanceError(RuntimeError):
    pass


def _fit(data: bytes, size: tuple[int, int] | None = None) -> bytes:
    """Keep the enhanced image at the original framing (resize back if a provider upscaled)."""
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=94)
    return out.getvalue()


async def _nanogpt(data: bytes) -> bytes:
    s = get_settings()
    im = Image.open(io.BytesIO(data)).convert("RGB")
    im.thumbnail((1536, 1536))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=92)
    url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    errors = []
    for label, key in (("nanogpt-1", s.NANOGPT_API_KEY), ("nanogpt-2", s.NANOGPT_API_KEY_2)):
        if not key:
            continue
        try:
            async with httpx.AsyncClient(timeout=240) as http:
                r = await http.post(f"{s.NANOGPT_API_BASE_URL}/images", headers={"Authorization": f"Bearer {key}"},
                                    json={"model": NANO_MODEL, "n": 1, "input_references": [url],
                                          "prompt": "Enhance and sharpen this photo. Keep the person, face, outfit, jewellery and colours exactly the same."})
                if r.status_code != 200:
                    raise EnhanceError(f"{label}: HTTP {r.status_code} {r.text[:160]}")
                item = (r.json().get("data") or [{}])[0]
                if item.get("b64_json"):
                    return base64.b64decode(item["b64_json"])
                if item.get("url"):
                    return (await http.get(item["url"])).content
                raise EnhanceError(f"{label}: no image in response")
        except (httpx.HTTPError, EnhanceError) as e:
            errors.append(str(e))
    raise EnhanceError("; ".join(errors) or "no NanoGPT key configured")


async def enhance(db: AsyncSession, data: bytes, *, session_id: uuid.UUID | None = None) -> tuple[bytes, str]:
    """Returns (jpeg bytes at the original size, provider label)."""
    size = Image.open(io.BytesIO(data)).size
    scale = 2 if max(size) <= 1024 else 1  # small photos get a 2x clarity upscale, then fit back
    try:
        r = await service.run_feature(db, "enhance", data, {"scale": scale}, session_id=session_id)
        return _fit(storage.read(r.image_path), size), "youcam" if not r.mock else "mock"
    except (YouCamError, ledger.BudgetExceeded) as e:
        log.warning("YouCam enhance failed (%s); trying NanoGPT", e)
    return _fit(await _nanogpt(data), size), "nanogpt"
