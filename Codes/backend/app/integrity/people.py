"""Multi-person photos: find the people, and work out which one is getting dressed.

YouCam Clothes VTO dresses "the largest person in the image" (filter_multi_person=off), so in a
couple's photo the bride's outfit can land on the groom (owner report, 2026-10-17). When a photo
has 2+ faces we pick a target person — automatically by matching the face close-up against every
face (OpenCV YuNet detector + SFace recogniser, both Apache-2.0, run locally), or by the user
tapping a face — and every layer is rendered on that person only (see looks/compose.py).
"""
from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np

MODELS = Path(__file__).parent / "models"
YUNET = MODELS / "face_detection_yunet_2023mar.onnx"
SFACE = MODELS / "face_recognition_sface_2021dec.onnx"
MATCH_THRESHOLD = 0.363  # SFace cosine threshold recommended by OpenCV for same-identity
MATCH_MARGIN = 0.12      # the best face must also beat the runner-up by this much, else ask the user
_lock = threading.Lock()
_det = None
_rec = None


def available() -> bool:
    return YUNET.exists() and SFACE.exists()


def _detector(w: int, h: int):
    global _det
    if _det is None:
        _det = cv2.FaceDetectorYN.create(str(YUNET), "", (w, h), score_threshold=0.75, nms_threshold=0.3, top_k=50)
    _det.setInputSize((w, h))
    return _det


def _recogniser():
    global _rec
    if _rec is None:
        _rec = cv2.FaceRecognizerSF.create(str(SFACE), "")
    return _rec


def detect_people(rgb: np.ndarray) -> list[dict]:
    """Faces left→right: {x,y,w,h,score,row} — row is YuNet's raw 15-value row (box + 5 landmarks)."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    scale = min(1.0, 2048 / max(w, h))
    small = cv2.resize(bgr, (int(w * scale), int(h * scale))) if scale < 1 else bgr
    with _lock:
        _, faces = _detector(small.shape[1], small.shape[0]).detect(small)
    out = []
    for row in (faces if faces is not None else []):
        r = row.copy()
        r[:14] /= scale
        x, y, fw, fh = (float(v) for v in r[:4])
        if fw < 12 or fh < 12:
            continue
        out.append({"x": int(x), "y": int(y), "w": int(fw), "h": int(fh), "score": round(float(r[14]), 3), "row": r.tolist()})
    out.sort(key=lambda f: f["x"] + f["w"] / 2)
    return out


def _embed(bgr: np.ndarray, row: list[float]) -> np.ndarray:
    rec = _recogniser()
    aligned = rec.alignCrop(bgr, np.asarray(row, dtype=np.float32))
    return rec.feature(aligned)


def match(closeup_rgb: np.ndarray, full_rgb: np.ndarray, people: list[dict]) -> tuple[int | None, list[float]]:
    """Index (into people) of the face that matches the close-up, plus all cosine scores."""
    probe = detect_people(closeup_rgb)
    if not probe or not people:
        return None, []
    face = max(probe, key=lambda f: f["w"] * f["h"])
    cb, fb = cv2.cvtColor(closeup_rgb, cv2.COLOR_RGB2BGR), cv2.cvtColor(full_rgb, cv2.COLOR_RGB2BGR)
    with _lock:
        ref = _embed(cb, face["row"])
        scores = [float(_recogniser().match(ref, _embed(fb, p["row"]), cv2.FaceRecognizerSF_FR_COSINE)) for p in people]
    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    best = order[0]
    runner = scores[order[1]] if len(order) > 1 else -1.0
    sure = scores[best] >= MATCH_THRESHOLD and scores[best] - runner >= MATCH_MARGIN
    return (best if sure else None), [round(s, 3) for s in scores]


def band(people: list[dict], target: int, width: int) -> tuple[int, int]:
    """Horizontal strip that contains only the target person: split halfway between neighbouring faces."""
    centres = [p["x"] + p["w"] / 2 for p in people]
    c, fw = centres[target], people[target]["w"]
    left = (centres[target - 1] + c) / 2 if target > 0 else 0.0
    right = (c + centres[target + 1]) / 2 if target + 1 < len(centres) else float(width)
    left, right = max(left, c - 5 * fw), min(right, c + 5 * fw)  # keep the strip reasonably tight
    return int(max(0, left)), int(min(width, right))


def public(people: list[dict]) -> list[dict]:
    return [{k: p[k] for k in ("x", "y", "w", "h", "score")} for p in people]
