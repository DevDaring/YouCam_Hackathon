from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import auth
from app.config import get_settings
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    username: str
    display_name: str | None
    is_demo: bool


def _out(u: User) -> UserOut:
    return UserOut(username=u.username, display_name=u.display_name, is_demo=u.is_demo)


@router.get("/demo")
def demo_credentials() -> dict:
    """Public on purpose: the login page shows these so judges can sign in with one tap."""
    s = get_settings()
    if not s.DEMO_USER:
        return {"enabled": False}
    return {"enabled": True, "username": s.DEMO_USER, "password": s.DEMO_PASSWORD}


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> UserOut:
    key = request.client.host if request.client else "unknown"
    if auth.limiter.blocked(key):
        raise HTTPException(429, "too many attempts, try again in a few minutes")
    user = await auth.authenticate(db, body.username.strip(), body.password)
    if user is None:
        auth.limiter.fail(key)
        raise HTTPException(401, "wrong username or password")
    auth.limiter.reset(key)
    token, expires = await auth.create_session(db, user)
    response.set_cookie(auth.COOKIE_NAME, token, expires=expires, httponly=True, samesite="lax",
                        secure=get_settings().COOKIE_SECURE, path="/")
    return _out(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> Response:
    token = request.cookies.get(auth.COOKIE_NAME)
    if token:
        await auth.end_session(db, token)
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(auth.current_user)) -> UserOut:
    return _out(user)
