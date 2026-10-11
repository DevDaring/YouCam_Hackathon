"""Shopper login: scrypt password hashes + opaque session cookie (only its sha256 is stored).

The family voting room stays login-free (spec K2); this guards the shopper side only.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models import AuthSession, User

COOKIE_NAME = "dy_session"
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        calc = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginRateLimiter:
    """Max `limit` failed attempts per key in `window` seconds (in-process; one worker)."""

    def __init__(self, limit: int = 10, window: float = 300):
        self.limit, self.window = limit, window
        self._fails: dict[str, deque[float]] = defaultdict(deque)

    def _trim(self, key: str) -> deque[float]:
        q, now = self._fails[key], time.monotonic()
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._trim(key)) >= self.limit

    def fail(self, key: str) -> None:
        self._trim(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._fails.pop(key, None)


limiter = LoginRateLimiter()


async def authenticate(db: AsyncSession, username: str, password: str) -> User | None:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if user is None:
        verify_password(password, hash_password("timing-equaliser"))
        return None
    return user if verify_password(password, user.password_hash) else None


async def create_session(db: AsyncSession, user: User) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=get_settings().AUTH_SESSION_DAYS)
    db.add(AuthSession(user_id=user.id, token_hash=_token_hash(token), expires_at=expires))
    await db.execute(delete(AuthSession).where(AuthSession.expires_at < datetime.now(timezone.utc)))
    await db.commit()
    return token, expires


async def end_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    await db.commit()


async def current_user_optional(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    row = (await db.execute(
        select(User).join(AuthSession, AuthSession.user_id == User.id)
        .where(AuthSession.token_hash == _token_hash(token), AuthSession.expires_at > datetime.now(timezone.utc))
    )).scalar_one_or_none()
    return row


async def current_user(user: User | None = Depends(current_user_optional)) -> User:
    if user is None:
        raise HTTPException(401, "login required")
    return user


async def seed_demo_user(db: AsyncSession) -> None:
    s = get_settings()
    if not s.DEMO_USER or not s.DEMO_PASSWORD:
        return
    user = (await db.execute(select(User).where(User.username == s.DEMO_USER))).scalar_one_or_none()
    if user is None:
        db.add(User(username=s.DEMO_USER, password_hash=hash_password(s.DEMO_PASSWORD), display_name="Jury demo", is_demo=True))
    elif not verify_password(s.DEMO_PASSWORD, user.password_hash):
        user.password_hash = hash_password(s.DEMO_PASSWORD)
    await db.commit()
