"""Public sharing of a finished look (owner: "share on all social media").

Each look gets a deterministic, unguessable token: base64url(HMAC-SHA256(SHARE_TOKEN_SECRET, look id)).
Only its sha256 is stored (spec §14: tokens hashed at rest). /s/{token} is a small server-rendered
page with Open Graph tags so WhatsApp / Facebook / X / Telegram show the look image as a preview.
Links stop working when the session's photos are deleted (IMAGE_RETENTION_HOURS).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.auth import current_user
from app.config import get_settings
from app.db import get_db
from app.models import CatalogueItem, Look, LookLayer, Session, User
from app.routers.looks import _owned_look

router = APIRouter(tags=["share"])
LOOK_NAMES = {"sindoor_dusk": "Sindoor Dusk", "marigold_morning": "Marigold Morning", "ivory_moon": "Ivory Moon"}


def share_token(look_id: uuid.UUID) -> str:
    mac = hmac.new(get_settings().SHARE_TOKEN_SECRET.encode(), f"look:{look_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")[:32]


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _title(look: Look) -> str:
    return f"Look {look.slot} · {LOOK_NAMES.get(look.preset or '', 'DearYou look')}"


def _text(look: Look, s: Session) -> str:
    event = (s.event_type or "event").replace("_", " ")
    return f"Help me choose! Here's my {LOOK_NAMES.get(look.preset or '', 'new')} look for my {event} — tell me Haan, Hmm or Na 💛"


async def _final_image_path(db: AsyncSession, look: Look) -> str | None:
    if look.enhanced_path and look.enhance_status == "done":
        return look.enhanced_path
    last = (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id, LookLayer.status == "done")
                             .order_by(LookLayer.position.desc()).limit(1))).scalar_one_or_none()
    return last.render_path if last else None


async def _by_token(db: AsyncSession, token: str) -> tuple[Look, Session] | None:
    if not token or len(token) > 64:
        return None
    look = (await db.execute(select(Look).where(Look.share_token_hash == _hash(token)))).scalar_one_or_none()
    if look is None:
        return None
    s = await db.get(Session, look.session_id)
    if s is None or (s.delete_after and s.delete_after <= datetime.now(timezone.utc)):
        return None
    return look, s


@router.post("/api/looks/{look_id}/share")
async def create_share(look_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    look = await _owned_look(db, look_id, user)
    s = await db.get(Session, look.session_id)
    if await _final_image_path(db, look) is None:
        raise HTTPException(409, "nothing_to_share")
    token = share_token(look.id)
    look.share_token_hash = _hash(token)
    await db.commit()
    base = get_settings().APP_URL.rstrip("/")
    return {"url": f"{base}/s/{token}", "image_url": f"/api/share/{token}/image", "title": _title(look),
            "text": _text(look, s), "expires_at": s.delete_after.isoformat() if s.delete_after else None}


@router.get("/api/share/{token}/image")
async def share_image(token: str, db: AsyncSession = Depends(get_db)) -> Response:
    found = await _by_token(db, token)
    path = await _final_image_path(db, found[0]) if found else None
    if not path:
        raise HTTPException(404, "not found")
    return Response(storage.read(path), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — DearYou</title><meta name="description" content="{text}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="DearYou"><meta property="og:title" content="{title} — DearYou">
<meta property="og:description" content="{text}"><meta property="og:url" content="{url}">{og_image}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title} — DearYou"><meta name="twitter:description" content="{text}">{tw_image}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,400&family=Inter:wght@400;600&display=swap">
<style>
:root{{--bg:#FFF9F0;--card:#F3E6D3;--ink:#1E1416;--maroon:#4A0E1C;--muted:#5C464A;--gold:#C9A24D;--mari:#F2A93B}}
@media (prefers-color-scheme:dark){{:root{{--bg:#140A0D;--card:#22131A;--ink:#F6EBDD;--maroon:#F8CF86;--muted:#CDB9A6}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Inter,system-ui,sans-serif}}
main{{max-width:560px;margin:0 auto;padding:20px 16px 40px}}a.brand{{font-family:Fraunces,Georgia,serif;font-size:26px;color:var(--maroon);text-decoration:none}}
h1{{font-family:Fraunces,Georgia,serif;color:var(--maroon);font-size:30px;margin:16px 0 4px}}.rule{{width:64px;height:2px;background:var(--gold);margin:8px 0 16px}}
figure{{margin:0;border-radius:24px;overflow:hidden;background:var(--card);border:1px solid var(--gold)}}img{{display:block;width:100%;height:auto}}
p.muted{{color:var(--muted)}}ul{{padding-left:18px}}a.cta{{display:inline-block;margin-top:18px;background:var(--maroon);color:var(--bg);padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600}}
.note{{font-size:13px;color:var(--muted);margin-top:18px}}</style></head>
<body><main><a class="brand" href="{home}"><i style="font-weight:400">Dear</i><b>You</b></a>{body}</main></body></html>"""


@router.get("/s/{token}", response_class=HTMLResponse)
async def share_page(token: str, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    home = get_settings().APP_URL.rstrip("/")
    found = await _by_token(db, token)
    if not found:
        body = ('<h1>This look is no longer available</h1><div class="rule"></div><p class="muted">Shared looks disappear when the photos '
                'are deleted, to protect privacy.</p><a class="cta" href="/">Try your own look</a>')
        return HTMLResponse(PAGE.format(title="Look not available", text="DearYou", url=f"{home}/s/{html.escape(token)}", og_image="",
                                        tw_image="", home=home, body=body), status_code=404)
    look, s = found
    img = f"{home}/api/share/{token}/image"
    items = []
    for l in (await db.execute(select(LookLayer).where(LookLayer.look_id == look.id, LookLayer.status == "done").order_by(LookLayer.position))).scalars().all():
        item = await db.get(CatalogueItem, l.item_id) if l.item_id else None
        items.append(html.escape(item.name) if item else l.layer.capitalize())
    title, text = html.escape(_title(look)), html.escape(_text(look, s))
    body = (f'<h1>{title}</h1><div class="rule"></div><p class="muted">{text}</p>'
            f'<figure><img src="{img}" alt="{title}: virtual try-on rendered with the YouCam API"></figure>'
            f'<ul>{"".join(f"<li>{i}</li>" for i in items)}</ul>'
            f'<a class="cta" href="{home}/">Try your own look on DearYou</a>'
            '<p class="note">Virtual try-on render. Product images are AI-generated. This link stops working when the photos are deleted.</p>')
    og = f'<meta property="og:image" content="{img}"><meta property="og:image:type" content="image/jpeg">'
    return HTMLResponse(PAGE.format(title=title, text=text, url=f"{home}/s/{token}", og_image=og,
                                    tw_image=f'<meta name="twitter:image" content="{img}">', home=home, body=body))
