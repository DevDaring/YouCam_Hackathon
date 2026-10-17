"""Crop → render → blend-back for face/neck layers on full-length photos.

Necklace (neck >= 15% of width), makeup (face >= 100 px, long side < 1920) and hairstyle
(face >= 128 px, long side <= 1024, jpg, shoulders visible) all need the upper body to fill
the frame, which a full-length photo does not. We cut a 3:4 head-and-shoulders crop around the
detected face, scale it to the feature's limits, render, scale the result back and blend it in
with a feathered mask so no seam shows.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

from app.integrity.quality import detect_faces

# long-side limits per feature (API_NOTES §5)
MAX_SIDE = {"necklace": 1600, "earrings": 1600, "makeup": 1600, "hair": 1024}


@dataclass
class Crop:
    box: tuple[int, int, int, int]  # left, top, right, bottom in the full image
    scale: float                    # crop pixels → sent pixels


class NoFace(ValueError):
    pass


def to_jpeg(img: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


@dataclass
class Target:
    """The person being dressed in a multi-person photo (coordinates in the full image)."""
    face: dict                  # {x, y, w, h}
    band: tuple[int, int]       # horizontal strip containing only this person


def upper_body_box(img: Image.Image, layer: str = "hair", target: Target | None = None) -> tuple[int, int, int, int]:
    if target is not None:
        f = target.face
    else:
        faces = detect_faces(np.asarray(img.convert("RGB")))
        if not faces:
            raise NoFace("no face found for the upper-body crop")
        f = max(faces, key=lambda d: d["w"] * d["h"])
    W, H = img.size
    cx = f["x"] + f["w"] / 2
    if layer == "necklace":
        # Live error 4: "Neck size should be larger and position should be in the center."
        # Narrow crop centred on the neck (just below the chin) so the neck is large and central.
        width = min(W, f["w"] * 2.6)
        height = min(H, width * 4 / 3)
        top = max(0.0, (f["y"] + f["h"] * 1.25) - height / 2)
    else:
        width = min(W, f["w"] * 3.4)          # head and shoulders: hair, ears, face
        height = min(H, width * 4 / 3)
        top = max(0.0, f["y"] - f["h"] * 0.9)  # room for hair above the face
    left = min(max(0.0, cx - width / 2), W - width)
    if top + height > H:
        top = max(0.0, H - height)
    box = [int(left), int(top), int(left + width), int(top + height)]
    if target is not None:  # never let a neighbour into the crop
        box[0], box[2] = max(box[0], target.band[0]), min(box[2], target.band[1])
    return tuple(box)  # type: ignore[return-value]


def prepare(img: Image.Image, layer: str, target: Target | None = None) -> tuple[bytes, Crop]:
    """Returns the bytes to send to YouCam and the crop needed to blend the answer back.
    With a target (multi-person photo) YouCam only ever sees that person's strip."""
    W, H = img.size
    face_layer = layer in MAX_SIDE
    if face_layer:
        box = upper_body_box(img, layer, target)
    elif target is not None:
        box = (target.band[0], 0, target.band[1], H)
    else:
        box = (0, 0, W, H)
    crop = img.crop(box)
    limit = MAX_SIDE.get(layer, 2048)
    scale = min(1.0 if not face_layer else 4.0, limit / max(crop.size))  # upscale small crops so faces pass size checks
    sent = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    return to_jpeg(sent), Crop(box=box, scale=scale)


def blend_back(base: Image.Image, result_bytes: bytes, crop: Crop) -> Image.Image:
    left, top, right, bottom = crop.box
    size = (right - left, bottom - top)
    result = Image.open(io.BytesIO(result_bytes)).convert("RGB").resize(size, Image.LANCZOS)
    if size == base.size:
        return result
    W, H = base.size
    feather = max(4, int(min(size) * 0.06))
    # Feather only the edges that lie inside the picture; edges on the image border stay hard.
    fl, fr = (feather if left > 0 else 0), (feather if right < W else 0)
    ft, fb = (feather if top > 0 else 0), (feather if bottom < H else 0)
    mask = Image.new("L", size, 0)
    inner = Image.new("L", (max(1, size[0] - fl - fr), max(1, size[1] - ft - fb)), 255)
    mask.paste(inner, (fl, ft))
    if feather:
        blurred = mask.filter(ImageFilter.GaussianBlur(feather / 2))
        # keep border-touching edges fully opaque after the blur
        arr = np.asarray(blurred).copy()
        if not fl: arr[:, :feather] = np.maximum(arr[:, :feather], np.asarray(mask)[:, :feather])
        if not fr: arr[:, -feather:] = np.maximum(arr[:, -feather:], np.asarray(mask)[:, -feather:])
        if not ft: arr[:feather, :] = np.maximum(arr[:feather, :], np.asarray(mask)[:feather, :])
        if not fb: arr[-feather:, :] = np.maximum(arr[-feather:, :], np.asarray(mask)[-feather:, :])
        mask = Image.fromarray(arr)
    out = base.convert("RGB").copy()
    out.paste(result, (left, top), mask)
    return out
