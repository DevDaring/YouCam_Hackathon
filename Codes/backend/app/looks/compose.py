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


def upper_body_box(img: Image.Image, layer: str = "hair") -> tuple[int, int, int, int]:
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
    return int(left), int(top), int(left + width), int(top + height)


def prepare(img: Image.Image, layer: str) -> tuple[bytes, Crop]:
    """Returns the bytes to send to YouCam and the crop needed to blend the answer back."""
    W, H = img.size
    face_layer = layer in MAX_SIDE
    box = upper_body_box(img, layer) if face_layer else (0, 0, W, H)
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
    feather = max(4, int(min(size) * 0.06))
    mask = Image.new("L", size, 0)
    inner = Image.new("L", (max(1, size[0] - 2 * feather), max(1, size[1] - 2 * feather)), 255)
    mask.paste(inner, (feather, feather))
    mask = mask.filter(ImageFilter.GaussianBlur(feather / 2))
    out = base.convert("RGB").copy()
    out.paste(result, (left, top), mask)
    return out
