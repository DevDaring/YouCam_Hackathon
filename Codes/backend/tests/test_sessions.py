import io

import pytest
from PIL import Image

from app import auth
from app.models import User

SESSION = {"country_code": "IN", "city": "Kolkata", "location_source": "timezone", "role": "bride",
           "event_type": "haldi", "event_date": "2027-02-14", "budget_amount": 75000, "currency": "INR",
           "locale": "bn", "style_tags": ["traditional"], "consent": True}


def jpeg_with_exif(size=(800, 1200), orientation=None) -> bytes:
    img = Image.new("RGB", size, (190, 160, 140))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"                       # Make
    exif[0x8825] = {2: (22.0, 34.0, 0.0), 1: "N"}      # GPS IFD
    if orientation:
        exif[0x0112] = orientation
    b = io.BytesIO()
    img.save(b, "JPEG", exif=exif)
    return b.getvalue()


async def login(client, db, username="TestUser", password="TestUser11"):
    await auth.seed_demo_user(db)
    auth.limiter.reset("127.0.0.1")
    r = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def test_requires_login(client, db):
    assert (await client.post("/api/sessions", json=SESSION)).status_code == 401


async def test_create_session_validates_against_country(client, db):
    await login(client, db)
    r = await client.post("/api/sessions", json=SESSION)
    assert r.status_code == 201 and r.json()["currency"] == "INR" and r.json()["delete_after"]
    for bad in ({"event_type": "walima"}, {"currency": "USD"}, {"city": "Paris"}, {"consent": False}, {"role": "x"}):
        assert (await client.post("/api/sessions", json={**SESSION, **bad})).status_code == 422, bad
    assert (await client.get("/api/sessions/latest")).json()["id"] == r.json()["id"]


async def test_photo_upload_strips_metadata_and_reports_quality(client, db):
    await login(client, db)
    sid = (await client.post("/api/sessions", json=SESSION)).json()["id"]
    raw = jpeg_with_exif(orientation=6)  # rotate 90° on display
    r = await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full", "source": "camera"},
                          files={"file": ("p.jpg", raw, "image/jpeg")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["width"], body["height"]) == (1200, 800)  # EXIF orientation applied
    q = body["quality"]
    assert q["source"] == "camera" and {c["key"] for c in q["checks"]} >= {"light", "sharp", "face"}
    face = next(c for c in q["checks"] if c["key"] == "face")
    assert face["status"] == "fail" and q["ok"] is False  # flat colour: no face found, reported honestly

    img = await client.get(body["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    stored = Image.open(io.BytesIO(img.content))
    assert not stored.getexif()  # EXIF incl. GPS stripped

    # replacing the photo keeps one per kind
    r2 = await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full"}, files={"file": ("p.png", raw, "image/png")})
    assert r2.status_code == 200
    assert len((await client.get(f"/api/sessions/{sid}")).json()["photos"]) == 1


@pytest.mark.parametrize("payload,code", [(b"not an image at all", "not_image"),
                                          (jpeg_with_exif(size=(200, 200)), "too_small")])
async def test_rejects_bad_uploads(client, db, payload, code):
    await login(client, db)
    sid = (await client.post("/api/sessions", json=SESSION)).json()["id"]
    r = await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full"}, files={"file": ("x.jpg", payload, "image/jpeg")})
    assert r.status_code == 422 and r.json()["detail"] == code


async def test_other_users_cannot_see_session(client, db):
    await login(client, db)
    sid = (await client.post("/api/sessions", json=SESSION)).json()["id"]
    db.add(User(username="other", password_hash=auth.hash_password("pw-other-1")))
    await db.commit()
    await client.post("/api/auth/logout")
    await login(client, db, "other", "pw-other-1")
    assert (await client.get(f"/api/sessions/{sid}")).status_code == 404
    assert (await client.get(f"/api/sessions/{sid}/photos/full")).status_code == 404


async def test_retention_purge_deletes_expired_sessions_and_files(client, db):
    from datetime import datetime, timedelta, timezone

    from app.config import get_settings
    from app.models import Photo, Session
    from app.retention import purge_expired

    await login(client, db)
    sid = (await client.post("/api/sessions", json=SESSION)).json()["id"]
    await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full"}, files={"file": ("p.jpg", jpeg_with_exif(), "image/jpeg")})
    folder = get_settings().STORAGE_DIR / "sessions" / sid
    assert any(folder.iterdir())

    assert await purge_expired() == 0  # not expired yet
    later = datetime.now(timezone.utc) + timedelta(hours=get_settings().IMAGE_RETENTION_HOURS + 1)
    assert await purge_expired(now=later) == 1
    assert not folder.exists()
    db.expire_all()
    assert await db.get(Session, __import__("uuid").UUID(sid)) is None
    from sqlalchemy import select
    assert (await db.execute(select(Photo))).scalars().all() == []
