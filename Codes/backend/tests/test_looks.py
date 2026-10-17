"""Look Studio: planning + layered rendering in mock mode (zero units)."""
import asyncio
import io
from decimal import Decimal
from pathlib import Path

import pytest
from PIL import Image

from app import auth, catalogue
from app.looks import render
from app.models import CatalogueItem, CataloguePrice

PORTRAIT = Path(__file__).resolve().parents[2] / "frontend" / "e2e" / "fixtures" / "portrait.png"
SESSION = {"country_code": "IN", "city": "Kolkata", "location_source": "manual", "role": "bride", "event_type": "wedding",
           "event_date": "2027-02-14", "budget_amount": 90000, "currency": "INR", "locale": "en", "style_tags": ["traditional"], "consent": True}

ITEMS = [  # sku, category, wear, base_inr, tags, metal, weight
    ("O-RED", "outfit", "women", 38000, ["wedding", "traditional"], None, "heavy"),
    ("O-PNK", "outfit", "women", 19000, ["mehendi"], None, "medium"),
    ("O-YEL", "outfit", "women", 14000, ["haldi"], None, "light"),
    ("O-GWN", "outfit", "women", 52000, ["wedding", "minimal"], None, "medium"),
    ("O-SHW", "outfit", "men", 42000, ["wedding"], None, "heavy"),
    ("O-KUR", "outfit", "men", 7000, ["haldi"], None, "light"),
    ("N-GLD", "necklace", "women", 21000, ["wedding"], "gold", "heavy"),
    ("N-PRL", "necklace", "women", 7800, ["haldi"], "silver", "light"),
    ("E-GLD", "earrings", "women", 6900, ["wedding"], "gold", "medium"),
    ("E-PRL", "earrings", "women", 3400, ["haldi"], "silver", "light"),
]


@pytest.fixture(autouse=True)
def _fast(monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_DELAY_SCALE", "0")
    monkeypatch.setattr(catalogue, "CATALOGUE_DIR", tmp_path)


async def seed_items(db, tmp_path):
    (tmp_path / "images").mkdir(exist_ok=True)
    for sku, cat, wear, inr, tags, metal, weight in ITEMS:
        Image.new("RGB", (400, 500), (150, 30, 50)).save(tmp_path / "images" / f"{sku}.jpg")
        item = CatalogueItem(sku=sku, category=cat, name=sku, wear=wear, event_tags=tags, metal=metal, weight_class=weight,
                             image_path=f"images/{sku}.jpg", licence="AI-generated (test)", is_ai_generated=True, base_inr=Decimal(inr),
                             youcam_params={"garment_category": "full_body"} if cat == "outfit" else None)
        db.add(item)
        await db.flush()
        db.add(CataloguePrice(item_id=item.id, country_code="IN", currency="INR", amount=Decimal(inr)))
    await db.commit()


async def login_and_session(client, db, **override) -> str:
    await auth.seed_demo_user(db)
    auth.limiter.reset("127.0.0.1")
    await client.post("/api/auth/login", json={"username": "TestUser", "password": "TestUser11"})
    sid = (await client.post("/api/sessions", json={**SESSION, **override})).json()["id"]
    r = await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full"}, files={"file": ("p.png", PORTRAIT.read_bytes(), "image/png")})
    assert r.status_code == 200
    return sid


async def wait_renders():
    for _ in range(200):
        if not render.RUNNING:
            return
        await asyncio.gather(*list(render.RUNNING.values()), return_exceptions=True)


async def test_bride_gets_three_fully_rendered_looks(client, db, tmp_path):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    r = await client.post(f"/api/sessions/{sid}/looks", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wear"] == "women" and body["round"] == 1 and len(body["looks"]) == 3
    first = body["looks"][0]
    assert [l["layer"] for l in first["layers"]] == ["outfit", "necklace", "earrings", "makeup", "hair"]
    assert first["layers"][0]["item"]["name"] in ("O-RED", "O-GWN")  # wedding outfits rank first
    await wait_renders()
    done = (await client.get(f"/api/sessions/{sid}/looks")).json()
    for look in done["looks"]:
        assert look["layers_done"] == 5, look["layers"]
        img = await client.get(look["image_url"])
        assert img.status_code == 200 and Image.open(io.BytesIO(img.content)).size[0] > 0
    # starting again does not re-render (no double spend)
    again = (await client.post(f"/api/sessions/{sid}/looks", json={})).json()
    assert again["round"] == 1 and again["looks"][0]["id"] == done["looks"][0]["id"]


async def test_replan_rounds_are_capped(client, db, tmp_path):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db, role="groom")
    for expected in (1, 2, 3):
        body = (await client.post(f"/api/sessions/{sid}/looks", json={"replan": expected > 1})).json()
        assert body["round"] == expected and all(len(l["layers"]) == 2 for l in body["looks"])  # men: outfit + hair
        await wait_renders()
    assert (await client.post(f"/api/sessions/{sid}/looks", json={"replan": True})).status_code == 429


async def test_family_member_must_choose_wear(client, db, tmp_path):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db, role="family")
    r = await client.post(f"/api/sessions/{sid}/looks", json={})
    assert r.status_code == 422 and r.json()["detail"] == "wear_required"
    r = await client.post(f"/api/sessions/{sid}/looks", json={"wear": "men"})
    assert r.status_code == 200 and r.json()["wear"] == "men"
    await wait_renders()


async def test_failed_layer_does_not_stop_look_and_retry_fixes_it(client, db, tmp_path, monkeypatch):
    from app.youcam import service
    from app.youcam.client import YouCamError
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    real = service.apply_makeup

    async def broken(*a, **k):
        raise YouCamError("error_face_angle_invalid", "face angle", engine=True)

    monkeypatch.setattr(service, "apply_makeup", broken)
    await client.post(f"/api/sessions/{sid}/looks", json={})
    await wait_renders()
    look = (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"][0]
    status = {l["layer"]: (l["status"], l["error"]) for l in look["layers"]}
    assert status["makeup"] == ("failed", "error_face_angle_invalid")
    assert status["hair"][0] == "done"  # later layers continue from the last good image

    monkeypatch.setattr(service, "apply_makeup", real)
    r = await client.post(f"/api/looks/{look['id']}/retry")
    assert r.status_code == 200
    await wait_renders()
    look = next(l for l in (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"] if l["id"] == look["id"])
    assert look["layers_done"] == 5
    assert (await client.post(f"/api/looks/{look['id']}/retry")).status_code == 409


@pytest.mark.parametrize("budget,over", [(26000, False), (20000, True)])
async def test_planner_ranks_by_event_and_flags_budget_honestly(client, db, tmp_path, budget, over):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db, event_type="haldi", budget_amount=budget, style_tags=["minimal"])
    looks = (await client.post(f"/api/sessions/{sid}/looks", json={})).json()["looks"]
    first = looks[0]
    assert first["layers"][0]["item"]["name"] == "O-YEL"  # haldi outfit first
    assert [l["item"]["name"] for l in first["layers"][1:3]] == ["N-PRL", "E-PRL"]  # light, matching metal
    assert Decimal(first["total_price"]) == 14000 + 7800 + 3400
    assert first["over_budget"] is over
    await wait_renders()


def test_shop_price_rounding():
    assert catalogue.shop_price(38500) == Decimal("38999")
    assert catalogue.shop_price(456.0) == Decimal("459")
    assert catalogue.shop_price(42.4) == Decimal("42")


async def test_orphaned_pending_layers_can_be_restarted(client, db, tmp_path):
    """After a server restart nothing renders 'pending' layers: startup marks them interrupted and retry resumes."""
    from sqlalchemy import update as sa_update
    from app.models import LookLayer
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    look = (await client.post(f"/api/sessions/{sid}/looks", json={})).json()["looks"][0]
    await wait_renders()
    await db.execute(sa_update(LookLayer).values(status="pending", error=None))  # simulate a crash mid-render
    await db.commit()
    await render.mark_interrupted()
    body = (await client.get(f"/api/sessions/{sid}/looks")).json()
    assert {l["error"] for l in body["looks"][0]["layers"]} == {"interrupted"}
    assert body["budget_amount"] == "90000.00"
    assert (await client.post(f"/api/looks/{look['id']}/retry")).status_code == 200
    await wait_renders()
    assert (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"][0]["layers_done"] == 5


async def _ready_look(client, db, tmp_path, **override):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db, **override)
    await client.post(f"/api/sessions/{sid}/looks", json={})
    await wait_renders()
    look = (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"][0]
    return sid, look


async def test_editor_options_for_every_layer(client, db, tmp_path):
    sid, look = await _ready_look(client, db, tmp_path)
    o = (await client.get(f"/api/looks/{look['id']}/options/necklace")).json()
    assert o["removable"] and o["layers_affected"] == ["necklace", "earrings", "makeup", "hair"]
    assert o["units_to_rerender"] == 1 + 1 + 1 + 2 and o["edits_left"] == 20
    assert sum(i["current"] for i in o["items"]) == 1 and {i["name"] for i in o["items"]} == {"N-GLD", "N-PRL"}
    assert all(i["image_url"].startswith("/api/catalogue/") for i in o["items"])
    out = (await client.get(f"/api/looks/{look['id']}/options/outfit")).json()
    assert not out["removable"] and all(i["name"].startswith("O-") and i["name"] not in ("O-SHW", "O-KUR") for i in out["items"])
    mk = (await client.get(f"/api/looks/{look['id']}/options/makeup")).json()["makeup"]
    assert len(mk["presets"]) == 3 and len(mk["lip_shades"]) == 10 and mk["current_lip"].startswith("#")
    hair = (await client.get(f"/api/looks/{look['id']}/options/hair")).json()["hair"]
    assert len(hair) > 10 and sum(h["current"] for h in hair) == 1 and hair[0]["thumb"].startswith("https://")


async def test_swap_necklace_rerenders_from_that_layer_and_reprices(client, db, tmp_path):
    sid, look = await _ready_look(client, db, tmp_path)
    outfit_url = look["layers"][0]["render_url"]
    other = next(i for i in (await client.get(f"/api/looks/{look['id']}/options/necklace")).json()["items"] if not i["current"])
    r = await client.patch(f"/api/looks/{look['id']}/layers/necklace", json={"item_id": other["id"]})
    assert r.status_code == 200, r.text
    edited = next(l for l in r.json()["looks"] if l["id"] == look["id"])
    st = {l["layer"]: l["status"] for l in edited["layers"]}
    assert st["outfit"] == "done" and all(st[k] == "pending" for k in ("necklace", "earrings", "makeup", "hair"))
    assert Decimal(edited["total_price"]) != Decimal(look["total_price"])
    assert r.json()["edits_left"] == 19
    # busy while rendering
    assert (await client.patch(f"/api/looks/{look['id']}/layers/hair", json={"template_id": "x"})).status_code == 409
    await wait_renders()
    done = next(l for l in (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"] if l["id"] == look["id"])
    assert done["layers_done"] == 5 and done["layers"][1]["item"]["id"] == other["id"]
    assert done["layers"][0]["render_url"] == outfit_url  # outfit was not re-rendered


async def test_makeup_mood_lip_hair_remove_and_add_back(client, db, tmp_path):
    sid, look = await _ready_look(client, db, tmp_path)
    lid = look["id"]
    r = await client.patch(f"/api/looks/{lid}/layers/makeup", json={"preset": "ivory_moon", "lip": "#7A1F3D"})
    assert r.status_code == 200
    await wait_renders()
    mk = (await client.get(f"/api/looks/{lid}/options/makeup")).json()["makeup"]
    assert mk["current_preset"] == "ivory_moon" and mk["current_lip"].upper() == "#7A1F3D"
    tpl = next(h for h in (await client.get(f"/api/looks/{lid}/options/hair")).json()["hair"] if not h["current"])
    assert (await client.patch(f"/api/looks/{lid}/layers/hair", json={"template_id": tpl["template_id"]})).status_code == 200
    await wait_renders()
    # remove earrings → off, total drops, later layers re-render without them
    r = await client.patch(f"/api/looks/{lid}/layers/earrings", json={"enabled": False})
    look2 = next(l for l in r.json()["looks"] if l["id"] == lid)
    assert {l["layer"]: l["status"] for l in look2["layers"]}["earrings"] == "off" and look2["layers_total"] == 4
    assert Decimal(look2["total_price"]) < Decimal(look["total_price"])
    await wait_renders()
    look3 = next(l for l in (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"] if l["id"] == lid)
    assert look3["layers_done"] == 4
    r = await client.patch(f"/api/looks/{lid}/layers/earrings", json={"enabled": True})
    assert r.status_code == 200
    await wait_renders()
    look4 = next(l for l in (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"] if l["id"] == lid)
    assert look4["layers_done"] == 5


async def test_edit_validation_and_limit(client, db, tmp_path):
    from sqlalchemy import update as sa_update
    from app.models import Session as S
    sid, look = await _ready_look(client, db, tmp_path)
    lid = look["id"]
    assert (await client.patch(f"/api/looks/{lid}/layers/outfit", json={"enabled": False})).json()["detail"] == "not_removable"
    men = (await client.get(f"/api/looks/{lid}/options/outfit")).json()  # bride: men's outfits never offered
    assert all(i["name"] not in ("O-SHW", "O-KUR") for i in men["items"])
    assert (await client.patch(f"/api/looks/{lid}/layers/makeup", json={"lip": "red"})).status_code == 422
    assert (await client.patch(f"/api/looks/{lid}/layers/hair", json={"template_id": "nope"})).status_code == 422
    await db.execute(sa_update(S).values(edit_count=20))
    await db.commit()
    assert (await client.patch(f"/api/looks/{lid}/layers/makeup", json={"preset": "ivory_moon"})).json()["detail"] == "edit_limit"


async def test_enhance_look_and_clear_on_edit(client, db, tmp_path):
    sid, look = await _ready_look(client, db, tmp_path)
    lid = look["id"]
    r = await client.post(f"/api/looks/{lid}/enhance")
    assert r.status_code == 200 and next(l for l in r.json()["looks"] if l["id"] == lid)["enhance_status"] == "running"
    await asyncio.gather(*list(render.ENHANCING.values()))
    l = next(l for l in (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"] if l["id"] == lid)
    assert l["enhance_status"] == "done" and l["enhanced_by"] == "mock" and l["enhanced_url"]
    assert (await client.get(l["enhanced_url"])).status_code == 200
    # editing a layer invalidates the enhanced image
    r = await client.patch(f"/api/looks/{lid}/layers/hair", json={"enabled": False})
    assert next(x for x in r.json()["looks"] if x["id"] == lid)["enhanced_url"] is None
    await wait_renders()
    await client.post(f"/api/looks/{lid}/enhance")
    await asyncio.gather(*list(render.ENHANCING.values()))
    r = await client.delete(f"/api/looks/{lid}/enhance")
    assert next(x for x in r.json()["looks"] if x["id"] == lid)["enhanced_url"] is None


async def test_enhance_and_restore_uploaded_photo(client, db, tmp_path):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    before = (await client.get(f"/api/sessions/{sid}")).json()["photos"][0]
    r = await client.post(f"/api/sessions/{sid}/photos/full/enhance")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["enhanced"] is True and p["url"] != before["url"] and p["quality"]["enhanced"] is True
    r = await client.post(f"/api/sessions/{sid}/photos/full/restore")
    assert r.status_code == 200 and r.json()["enhanced"] is False and r.json()["url"] == before["url"]
    assert (await client.post(f"/api/sessions/{sid}/photos/full/restore")).status_code == 409


async def test_share_link_public_page_and_expiry(client, db, tmp_path):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select as sa_select, update as sa_update
    from app.models import Look, Session as S
    sid, look = await _ready_look(client, db, tmp_path)
    r = await client.post(f"/api/looks/{look['id']}/share")
    assert r.status_code == 200
    share = r.json()
    assert share["url"].split("/s/")[1] and share["title"].startswith("Look 1") and "Haan" in share["text"]
    assert (await client.post(f"/api/looks/{look['id']}/share")).json()["url"] == share["url"]  # stable
    token = share["url"].split("/s/")[1]
    stored = (await db.execute(sa_select(Look.share_token_hash).where(Look.id == __import__("uuid").UUID(look["id"])))).scalar_one()
    assert stored and token not in stored  # only the hash is stored
    await client.post("/api/auth/logout")  # public: no login needed
    img = await client.get(share["image_url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    page = await client.get(f"/s/{token}")
    assert page.status_code == 200 and 'property="og:image"' in page.text and share["image_url"] in page.text
    assert (await client.get("/s/not-a-real-token")).status_code == 404
    await db.execute(sa_update(S).values(delete_after=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db.commit()
    gone = await client.get(f"/s/{token}")
    assert gone.status_code == 404 and "no longer available" in gone.text
    assert (await client.get(share["image_url"])).status_code == 404


async def test_share_requires_a_rendered_layer(client, db, tmp_path, monkeypatch):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    monkeypatch.setattr(render, "start", lambda *a, **k: None)  # nothing renders
    look = (await client.post(f"/api/sessions/{sid}/looks", json={})).json()["looks"][0]
    assert (await client.post(f"/api/looks/{look['id']}/share")).json()["detail"] == "nothing_to_share"


FIX = Path(__file__).parent / "fixtures"


async def _couple_session(client, db, tmp_path):
    await seed_items(db, tmp_path)
    await auth.seed_demo_user(db)
    auth.limiter.reset("127.0.0.1")
    await client.post("/api/auth/login", json={"username": "TestUser", "password": "TestUser11"})
    sid = (await client.post("/api/sessions", json=SESSION)).json()["id"]
    r = await client.post(f"/api/sessions/{sid}/photos", data={"kind": "full"}, files={"file": ("c.jpg", (FIX / "couple_ai.jpg").read_bytes(), "image/jpeg")})
    return sid, r.json()


async def test_group_photo_needs_a_chosen_person(client, db, tmp_path):
    sid, full = await _couple_session(client, db, tmp_path)
    assert len(full["people"]) == 2 and full["target"] is None
    assert (await client.get(full["people"][0]["thumb_url"])).headers["content-type"] == "image/jpeg"
    r = await client.post(f"/api/sessions/{sid}/looks", json={})
    assert r.status_code == 422 and r.json()["detail"] == "person_required"


async def test_face_closeup_picks_the_bride_and_only_she_is_dressed(client, db, tmp_path):
    import numpy as np
    sid, full = await _couple_session(client, db, tmp_path)
    await client.post(f"/api/sessions/{sid}/photos", data={"kind": "face"}, files={"file": ("f.jpg", (FIX / "bride_close_ai.jpg").read_bytes(), "image/jpeg")})
    full = next(p for p in (await client.get(f"/api/sessions/{sid}")).json()["photos"] if p["kind"] == "full")
    assert (full["target"], full["target_source"]) == (0, "match")  # bride stands on the left
    await client.post(f"/api/sessions/{sid}/looks", json={})
    await wait_renders()
    look = (await client.get(f"/api/sessions/{sid}/looks")).json()["looks"][0]
    assert look["layers_done"] == 5
    before = np.asarray(Image.open(io.BytesIO((await client.get(full["url"])).content)).convert("RGB")).astype(int)
    after = np.asarray(Image.open(io.BytesIO((await client.get(look["image_url"])).content)).convert("RGB").resize((before.shape[1], before.shape[0]))).astype(int)
    groom = full["people"][1]
    gx0, gx1 = groom["x"] - groom["w"], groom["x"] + 2 * groom["w"]
    bride = full["people"][0]
    bx0, bx1 = bride["x"], bride["x"] + bride["w"]
    groom_change = np.abs(after[:, gx0:gx1] - before[:, gx0:gx1]).mean()
    bride_change = np.abs(after[:, bx0:bx1] - before[:, bx0:bx1]).mean()
    assert groom_change < 2.0, groom_change   # the other person is untouched (JPEG noise only)
    assert bride_change > 5.0, bride_change    # the bride is the one who changed


async def test_users_tap_wins_over_auto_match(client, db, tmp_path):
    sid, full = await _couple_session(client, db, tmp_path)
    r = await client.post(f"/api/sessions/{sid}/photos/full/target", json={"index": 1})
    assert (r.json()["target"], r.json()["target_source"]) == (1, "user")
    await client.post(f"/api/sessions/{sid}/photos", data={"kind": "face"}, files={"file": ("f.jpg", (FIX / "bride_close_ai.jpg").read_bytes(), "image/jpeg")})
    full = next(p for p in (await client.get(f"/api/sessions/{sid}")).json()["photos"] if p["kind"] == "full")
    assert (full["target"], full["target_source"]) == (1, "user")
    assert (await client.post(f"/api/sessions/{sid}/photos/full/target", json={"index": 7})).status_code == 422


async def test_single_person_photo_has_no_picker(client, db, tmp_path):
    await seed_items(db, tmp_path)
    sid = await login_and_session(client, db)
    full = (await client.get(f"/api/sessions/{sid}")).json()["photos"][0]
    assert full["people"] == [] and full["target"] is None
