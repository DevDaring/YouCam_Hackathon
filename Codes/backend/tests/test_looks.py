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
