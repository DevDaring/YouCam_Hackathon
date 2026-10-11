"""Upload intake: decode with Pillow (never trust the declared type), honour EXIF rotation,
then re-encode as JPEG — which strips EXIF/GPS and any other metadata — capped at MAX_SIDE."""
from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 12 * 1024 * 1024
MAX_SIDE = 2048          # YouCam limits: long side <= 4096 (clothes), < 1920 (makeup) — resized per feature later
MIN_SIDE = 320           # fitzpatrick needs >= 320 short side
ALLOWED = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = multi-picture JPEG from some phones
Image.MAX_IMAGE_PIXELS = 60_000_000      # decompression-bomb guard


class ImageRejected(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code  # too_large | not_image | unsupported_format | too_small


def normalise(data: bytes) -> tuple[bytes, Image.Image]:
    if len(data) > MAX_BYTES:
        raise ImageRejected("too_large")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ImageRejected("not_image") from None
    if fmt not in ALLOWED:
        raise ImageRejected("unsupported_format")
    img = ImageOps.exif_transpose(img).convert("RGB")
    if min(img.size) < MIN_SIDE:
        raise ImageRejected("too_small")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=92, optimize=True)  # no exif= → metadata dropped
    return out.getvalue(), img
