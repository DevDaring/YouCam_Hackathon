"""Text-to-image for the demo catalogue (D-010): YouCam AI Image Generator V2 first (1 unit, goes
through the unit ledger), then NanoGPT account 1, then NanoGPT account 2.

Response shapes (live probes, fixtures/youcam/probe/): YouCam poll → data.results.url;
NanoGPT /images/generations → data[0].b64_json.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.db import SessionLocal
from app.ledger import ledger
from app.youcam import service as youcam
from app.youcam.client import YouCamClient, YouCamError

log = logging.getLogger("dearyou.imagegen")

YOUCAM_SIZES = {"3:4": "1104*1472", "1:1": "1328*1328", "4:3": "1472*1104"}
NANO_SIZES = {"3:4": "1024x1365", "1:1": "1024x1024", "4:3": "1365x1024"}


@dataclass
class GeneratedImage:
    data: bytes
    provider: str  # youcam | nanogpt-1 | nanogpt-2
    model: str


class ImageGenError(RuntimeError):
    pass


# YouCam runs an account's image jobs one after another (live observation 2026-10-11: with 7 jobs
# in flight, later ones waited > 8 min). So each account takes ONE image job at a time, the two
# accounts run in parallel, and we wait long enough never to abandon a job that will be charged.
_pool: asyncio.Queue[int] | None = None
IMAGE_WAIT_S = 900


async def _youcam(prompt: str, negative: str, aspect: str) -> GeneratedImage:
    global _pool
    if _pool is None:
        _pool = asyncio.Queue()
        for a in youcam.accounts():
            _pool.put_nowait(a)
    account = await _pool.get()
    try:
        bal = await youcam.account_balance(account)
        if bal is None or bal - 1 < get_settings().YOUCAM_UNIT_RESERVE:
            raise ImageGenError(f"YouCam account {account} is at its reserve")
        async with SessionLocal() as db:
            await ledger.ensure_budget(db, "image_gen", 1)
        client = YouCamClient(account=account)
        try:
            body = {"model": "youcam-image-v2", "prompt": prompt[:800], "size": YOUCAM_SIZES[aspect], "prompt_extend": False}
            if negative:
                body["negative_prompt"] = negative[:500]
            task_id = await client.start_task("image_gen", body)
            log.info("image task %s on account %s", task_id, account)
            try:
                res = await client.wait_task("image_gen", task_id, total=IMAGE_WAIT_S)
            except YouCamError as e:
                async with SessionLocal() as db:
                    await ledger.record(db, feature="image_gen", units=0, status="failed", account=account, task_id=task_id,
                                        note=f"{e.code}: {e.message}"[:500])
                raise
            except TimeoutError:
                async with SessionLocal() as db:
                    await ledger.record(db, feature="image_gen", units=1, status="timeout", account=account, task_id=task_id,
                                        note="stopped waiting; result can be fetched by task id for 24 h")
                raise ImageGenError(f"YouCam task {task_id} still running after {IMAGE_WAIT_S}s") from None
            data = await client.download(res.url) if res.url else b""
            async with SessionLocal() as db:
                await ledger.record(db, feature="image_gen", units=1, account=account, task_id=task_id)
            if account in youcam._balances:
                youcam._balances[account] -= 1
            if not data:
                raise ImageGenError("YouCam returned no image")
            return GeneratedImage(data, f"youcam-{account}", "youcam-image-v2")
        finally:
            await client.aclose()
    finally:
        _pool.put_nowait(account)


async def _nanogpt(key: str, label: str, prompt: str, negative: str, aspect: str) -> GeneratedImage:
    s = get_settings()
    full_prompt = f"{prompt}\nAvoid: {negative}" if negative else prompt
    async with httpx.AsyncClient(timeout=180) as http:
        r = await http.post(f"{s.NANOGPT_API_BASE_URL}/images/generations", headers={"Authorization": f"Bearer {key}"},
                            json={"model": s.NANOGPT_IMAGE_MODEL, "prompt": full_prompt, "n": 1, "size": NANO_SIZES[aspect]})
    if r.status_code != 200:
        raise ImageGenError(f"{label}: HTTP {r.status_code} {r.text[:200]}")
    item = (r.json().get("data") or [{}])[0]
    if item.get("b64_json"):
        return GeneratedImage(base64.b64decode(item["b64_json"]), label, s.NANOGPT_IMAGE_MODEL)
    if item.get("url"):
        async with httpx.AsyncClient(timeout=60) as http:
            return GeneratedImage((await http.get(item["url"])).content, label, s.NANOGPT_IMAGE_MODEL)
    raise ImageGenError(f"{label}: no image in response")


async def generate(prompt: str, negative: str = "", aspect: str = "3:4") -> GeneratedImage:
    s = get_settings()
    errors: list[str] = []
    try:
        return await _youcam(prompt, negative, aspect)
    except (YouCamError, ledger.BudgetExceeded, ImageGenError, httpx.HTTPError, TimeoutError) as e:
        errors.append(f"youcam: {e}")
        log.warning("YouCam image generation failed, trying NanoGPT: %s", e)
    for label, key in (("nanogpt-1", s.NANOGPT_API_KEY), ("nanogpt-2", s.NANOGPT_API_KEY_2)):
        if not key:
            continue
        try:
            return await _nanogpt(key, label, prompt, negative, aspect)
        except (ImageGenError, httpx.HTTPError) as e:
            errors.append(str(e))
            log.warning("%s failed: %s", label, e)
    raise ImageGenError("all image providers failed: " + " | ".join(errors))
