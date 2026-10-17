"""Layered look rendering (spec K1, §7.4): outfit → necklace → earrings → makeup → hair, each layer
rendered on the previous layer's output. One failed layer never aborts the look: it is marked
failed with a reason and later layers continue from the last good image.
"""
from __future__ import annotations

import asyncio
import io
import logging
import uuid

from PIL import Image, ImageOps
from sqlalchemy import select, update

from app import storage
from app.catalogue import image_path
from app.db import SessionLocal
from app.ledger import ledger
from app.looks import compose
from app.models import CatalogueItem, Look, LookLayer, Photo
from app.youcam import service
from app.youcam.client import YouCamError

log = logging.getLogger("dearyou.render")
YOUCAM_SLOTS = asyncio.Semaphore(4)          # concurrent YouCam tasks across all looks
RUNNING: dict[uuid.UUID, asyncio.Task] = {}  # look_id → render task (one API worker)
ENHANCING: dict[uuid.UUID, asyncio.Task] = {}  # look_id → enhance task

NECKLACE_PARAMS = {"necklace_need_remove_background": True, "necklace_shadow_intensity": 0.3, "necklace_ambient_light_intensity": 0.9}
EARRING_PARAMS = {"earring_need_remove_background": True, "earring_shadow_intensity": 0.3, "earring_ambient_light_intensity": 0.9}


def _open(data: bytes) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")


def target_for(photo: Photo, image_size: tuple[int, int]) -> compose.Target | None:
    """Multi-person photos: the chosen person (by face match or the user's tap). None = single person."""
    q = photo.quality_json or {}
    people_, idx = q.get("people") or [], q.get("target")
    if len(people_) < 2 or idx is None or not 0 <= idx < len(people_):
        return None
    from app.integrity.people import band
    return compose.Target(face=people_[idx], band=band(people_, idx, image_size[0]))


async def _render_layer(db, layer: LookLayer, current: Image.Image, session_id: uuid.UUID,
                        target: compose.Target | None = None) -> tuple[Image.Image, int]:
    item = await db.get(CatalogueItem, layer.item_id) if layer.item_id else None
    ref = image_path(item).read_bytes() if item and image_path(item) else None
    async with YOUCAM_SLOTS:
        if layer.layer == "outfit":
            if ref is None:
                raise ValueError("catalogue image missing")
            gc = (item.youcam_params or {}).get("garment_category", "full_body")
            if target is not None:  # dress only the chosen person: YouCam sees just their strip
                sent, crop = compose.prepare(current, "outfit", target)
                r = await service.try_on_cloth(db, sent, ref, gc, session_id=session_id)
                return compose.blend_back(current, storage.read(r.image_path), crop), r.units
            src = compose.to_jpeg(current)
            r = await service.try_on_cloth(db, src, ref, gc, session_id=session_id)
            return _open(storage.read(r.image_path)), r.units
        sent, crop = compose.prepare(current, layer.layer, target)
        if layer.layer == "necklace":
            r = await service.try_on_necklace(db, sent, ref, NECKLACE_PARAMS, session_id=session_id)
        elif layer.layer == "earrings":
            r = await service.try_on_earrings(db, sent, ref, EARRING_PARAMS, session_id=session_id)
        elif layer.layer == "makeup":
            r = await service.apply_makeup(db, sent, (layer.params or {})["effects"], session_id=session_id)
        elif layer.layer == "hair":
            r = await service.apply_hairstyle(db, sent, (layer.params or {})["template_id"], session_id=session_id)
        else:
            raise ValueError(f"unknown layer {layer.layer}")
        return compose.blend_back(current, storage.read(r.image_path), crop), r.units


async def render_look(look_id: uuid.UUID, from_position: int = 0) -> None:
    async with SessionLocal() as db:
        look = await db.get(Look, look_id)
        if look is None:
            return
        layers = (await db.execute(select(LookLayer).where(LookLayer.look_id == look_id).order_by(LookLayer.position))).scalars().all()
        base = (await db.execute(select(Photo).where(Photo.session_id == look.session_id, Photo.kind == "full"))).scalar_one_or_none()
        if base is None:
            await db.execute(update(LookLayer).where(LookLayer.look_id == look_id).values(status="failed", error="no_photo"))
            await db.commit()
            return
        # Resume from the last good layer before from_position.
        current = _open(storage.read(base.storage_path))
        target = target_for(base, current.size)
        for l in layers:
            if l.position < from_position and l.status == "done" and l.render_path:
                current = _open(storage.read(l.render_path))
        stop_reason = None
        for layer in layers:
            if layer.position < from_position or layer.status == "off":  # "off" = removed by the user
                continue
            if stop_reason:
                layer.status, layer.error = "skipped", stop_reason
                await db.commit()
                continue
            layer.status, layer.error = "rendering", None
            await db.commit()
            try:
                current, units = await _render_layer(db, layer, current, look.session_id, target)
                path = storage.save(f"sessions/{look.session_id}/looks/{look.id}/{layer.position}-{layer.layer}.jpg", compose.to_jpeg(current))
                layer.render_path, layer.status, layer.units_spent = path, "done", layer.units_spent + units
            except ledger.BudgetExceeded:
                layer.status, layer.error = "failed", "budget"
                stop_reason = "budget"
            except YouCamError as e:
                # Some engines return bare numeric codes ("4"); keep YouCam's own message with them.
                layer.status, layer.error = "failed", (f"{e.code}: {e.message}" if e.code.isdigit() and e.message else e.code)[:200]
            except compose.NoFace:
                layer.status, layer.error = "failed", "no_face"
            except Exception as e:  # keep the look going; log for us
                log.exception("layer %s of look %s failed", layer.layer, look_id)
                layer.status, layer.error = "failed", type(e).__name__
            await db.commit()


def start(look_id: uuid.UUID, from_position: int = 0) -> None:
    task = RUNNING.get(look_id)
    if task and not task.done():
        return
    t = asyncio.create_task(render_look(look_id, from_position))
    RUNNING[look_id] = t
    t.add_done_callback(lambda _: RUNNING.pop(look_id, None))


async def mark_interrupted() -> None:
    """On startup nothing is rendering yet, so layers left 'rendering' or 'pending' by a previous
    process are orphaned: mark them failed/interrupted so the Studio offers 'Try again'."""
    async with SessionLocal() as db:
        await db.execute(update(LookLayer).where(LookLayer.status.in_(("rendering", "pending")))
                         .values(status="failed", error="interrupted"))
        await db.execute(update(Look).where(Look.enhance_status == "running").values(enhance_status="failed", enhance_error="interrupted"))
        await db.commit()


async def enhance_look(look_id: uuid.UUID) -> None:
    from app.enhance import EnhanceError, enhance
    async with SessionLocal() as db:
        look = await db.get(Look, look_id)
        last = (await db.execute(select(LookLayer).where(LookLayer.look_id == look_id, LookLayer.status == "done")
                                 .order_by(LookLayer.position.desc()).limit(1))).scalar_one_or_none()
        if look is None or last is None:
            return
        try:
            data, provider = await enhance(db, storage.read(last.render_path), session_id=look.session_id)
            look.enhanced_path = storage.save(f"sessions/{look.session_id}/looks/{look.id}/enhanced-{last.position}.jpg", data)
            look.enhance_status, look.enhance_error, look.enhanced_by = "done", None, provider
        except (EnhanceError, YouCamError, ledger.BudgetExceeded) as e:
            look.enhance_status, look.enhance_error = "failed", str(getattr(e, "code", e))[:200]
        except Exception as e:
            log.exception("enhance of look %s failed", look_id)
            look.enhance_status, look.enhance_error = "failed", type(e).__name__
        await db.commit()


def start_enhance(look_id: uuid.UUID) -> None:
    task = ENHANCING.get(look_id)
    if task and not task.done():
        return
    t = asyncio.create_task(enhance_look(look_id))
    ENHANCING[look_id] = t
    t.add_done_callback(lambda _: ENHANCING.pop(look_id, None))
