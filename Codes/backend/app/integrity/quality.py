"""Photo quality gate (spec §9.1 /quality): brightness, sharpness, face presence and size.

Returns machine-readable checks; the UI turns codes into friendly, translated messages.
Nothing here judges skin — it only checks whether the photo is usable for try-on.

Face detection: MediaPipe BlazeFace (short range, Apache-2.0, bundled in models/). The model
sees the image at ~128 px, so faces in full-length photos are found by a multi-scale tiled
pass over the upper body when the whole-image pass finds nothing.
"""
from __future__ import annotations

import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

import cv2
import numpy as np

MODEL = Path(__file__).parent / "models" / "blaze_face_short_range.tflite"
_lock = threading.Lock()
_detector = None


@dataclass
class Check:
    key: str      # light | sharp | face | face_size | framing
    status: str   # pass | warn | fail
    value: float | int | None = None


@dataclass
class QualityReport:
    ok: bool                       # usable (no hard fail)
    checks: list[Check] = field(default_factory=list)
    faces: list[dict] = field(default_factory=list)  # {x,y,w,h,score} in pixels
    width: int = 0
    height: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def _get_detector():
    global _detector
    if _detector is None:
        from mediapipe.tasks.python import BaseOptions, vision
        _detector = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
            base_options=BaseOptions(model_asset_path=str(MODEL)), min_detection_confidence=0.6))
    return _detector


def close_detector() -> None:
    """Call on app shutdown: MediaPipe's own finaliser fails if it runs during interpreter exit."""
    global _detector
    if _detector is not None:
        _detector.close()
        _detector = None


def _detect(rgb: np.ndarray) -> list[tuple[int, int, int, int, float]]:
    import mediapipe as mp
    res = _get_detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    out = []
    for d in res.detections:
        b = d.bounding_box
        out.append((b.origin_x, b.origin_y, b.width, b.height, float(d.categories[0].score)))
    return out


def _iou(a, b) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw, ih = max(0, min(ax2, bx2) - max(a[0], b[0])), max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    return inter / float(a[2] * a[3] + b[2] * b[3] - inter or 1)


def detect_faces(rgb: np.ndarray) -> list[dict]:
    with _lock:  # MediaPipe detector is not thread-safe
        faces = _detect(rgb)
        if not faces:
            h, w = rgb.shape[:2]
            for frac in (0.5, 0.3):
                s = max(64, int(min(w, h) * frac))
                step = max(32, s // 2)
                for y in range(0, max(1, int(h * 0.75) - s + 1), step):
                    for x in range(0, max(1, w - s + 1), step):
                        for fx, fy, fw, fh, sc in _detect(rgb[y:y + s, x:x + s]):
                            faces.append((x + fx, y + fy, fw, fh, sc))
                if faces:
                    break
    # non-maximum suppression
    faces.sort(key=lambda f: -f[4])
    kept: list[tuple] = []
    for f in faces:
        if all(_iou(f, k) < 0.3 for k in kept):
            kept.append(f)
    return [{"x": int(x), "y": int(y), "w": int(w), "h": int(h), "score": round(s, 3)} for x, y, w, h, s in kept]


def assess(rgb: np.ndarray, kind: str) -> QualityReport:
    """kind: 'full' (full-length photo) or 'face' (close-up)."""
    h, w = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    checks: list[Check] = []

    # Light: mean luminance (0-255). Too dark < 60, too bright > 215.
    mean = float(gray.mean())
    checks.append(Check("light", "fail" if mean < 45 else "warn" if mean < 70 or mean > 215 else "pass", round(mean, 1)))

    # Sharpness: variance of the Laplacian on a 1000-px-wide copy (scale-independent-ish).
    scale = 1000 / max(w, h)
    small = cv2.resize(gray, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1 else gray
    sharp = float(cv2.Laplacian(small, cv2.CV_64F).var())
    checks.append(Check("sharp", "warn" if sharp < 40 else "pass", round(sharp, 1)))

    faces = detect_faces(rgb)
    if not faces:
        checks.append(Check("face", "fail", 0))
    elif len(faces) > 1:
        checks.append(Check("face", "warn", len(faces)))  # YouCam: one person per photo
    else:
        checks.append(Check("face", "pass", 1))

    if faces:
        f = max(faces, key=lambda d: d["w"] * d["h"])
        ratio = f["w"] / w
        if kind == "face":
            # Skin/face features want the face to fill most of the frame.
            checks.append(Check("face_size", "pass" if ratio >= 0.25 else "warn", round(ratio, 3)))
        else:
            # Full length: the face should be small and near the top (the body below it).
            top = (f["y"] + f["h"] / 2) / h
            checks.append(Check("face_size", "pass" if ratio >= 0.035 else "warn", round(ratio, 3)))
            checks.append(Check("framing", "pass" if ratio <= 0.3 and top <= 0.4 else "warn", round(top, 3)))

    ok = not any(c.status == "fail" for c in checks)
    return QualityReport(ok=ok, checks=checks, faces=faces, width=w, height=h)
