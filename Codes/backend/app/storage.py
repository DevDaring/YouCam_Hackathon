"""Private file storage on local disk (replaces Supabase Storage). Never mounted as static files."""
from __future__ import annotations

from pathlib import Path

from app.config import get_settings


def _root() -> Path:
    root = get_settings().STORAGE_DIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def save(rel_path: str, data: bytes) -> str:
    p = (_root() / rel_path).resolve()
    if _root().resolve() not in p.parents:
        raise ValueError("path escapes storage root")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return rel_path


def read(rel_path: str) -> bytes:
    p = (_root() / rel_path).resolve()
    if _root().resolve() not in p.parents:
        raise ValueError("path escapes storage root")
    return p.read_bytes()
