"""YouCam module against documented fixtures (mock mode) and a fake HTTP transport (live path)."""
import io
import json

import httpx
import pytest
from PIL import Image

from app import storage
from app.config import ROOT_DIR, get_settings
from app.ledger import ledger
from app.youcam import service
from app.youcam.client import YouCamClient, YouCamError
from app.youcam.features import FEATURES

DOCS = ROOT_DIR / "fixtures" / "youcam" / "docs_examples"


def ex(name):
    return json.loads((DOCS / name).read_text())["example"]


def jpeg(color=(200, 150, 120), size=(600, 800)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "JPEG")
    return b.getvalue()


@pytest.fixture(autouse=True)
def _fast_mock(monkeypatch):
    monkeypatch.setenv("MOCK_DELAY_SCALE", "0")
    service._balances.clear()  # each test starts with no cached account balance
    service._calls.clear()


def test_unit_costs_match_live_price_list():
    assert FEATURES["cloth"].units({}) == 2
    assert FEATURES["necklace"].units({}) == 1
    assert FEATURES["skin_analysis"].units({"dst_actions": ["moisture", "radiance", "texture", "pore"]}) == 9
    assert FEATURES["skin_analysis"].units({"dst_actions": ["hd_moisture"] * 5}) == 16
    assert FEATURES["skin_tone"].units({}) == 20
    assert FEATURES["face"].units({"features": ["faceShape"]}) == 10
    assert FEATURES["cloth"].task_path == "/s2s/v2.0/task/cloth-v4"
    assert FEATURES["hairstyle"].task_path == "/s2s/v2.1/task/hair-transfer"


async def test_mock_mode_image_and_json_features(db):
    assert get_settings().MOCK_MODE
    r = await service.try_on_cloth(db, jpeg(), jpeg((120, 20, 40)), "full_body")
    assert r.mock and r.image_path and storage.read(r.image_path)[:2] == b"\xff\xd8"
    tone = await service.analyze_skin_tone(db, jpeg())
    assert tone.data["color"]["skin_color"].startswith("#")
    skin = await service.analyze_skin(db, jpeg(), ["moisture", "radiance"])
    assert isinstance(skin.data["output"], list)
    assert await ledger.units_spent(db) == 0


async def test_validation_errors(db):
    with pytest.raises(ValueError):
        await service.try_on_cloth(db, jpeg(), jpeg(), "saree")
    with pytest.raises(ValueError):
        await service.analyze_skin(db, jpeg(), ["moisture", "hd_pore"])
    with pytest.raises(ValueError):
        await service.simulate_skin(db, jpeg(), {"radiance": 0})


def fake_youcam(poll_payload, calls, balance=100):
    def api(request: httpx.Request):
        calls.append((request.method, request.url.path))
        assert request.headers["authorization"].startswith("Bearer ")
        if request.url.path == "/s2s/v2.0/file":
            body = json.loads(request.content)
            assert body["files"][0]["file_size"] > 0
            return httpx.Response(200, json=ex("file_create.json"))
        if request.url.path == "/s2s/v1.0/client/credit":
            return httpx.Response(200, json={"status": 200, "results": [{"id": 1, "type": "ApiPaygToken", "amount_dec": balance}]})
        if request.method == "POST" and "/task/" in request.url.path:
            return httpx.Response(200, json={"status": 200, "data": {"task_id": "t-123"}})
        if request.method == "GET" and request.url.path.endswith("/t-123"):
            return httpx.Response(200, json=poll_payload)
        return httpx.Response(404, json={"status": 404, "error": "not found"})

    def raw(request: httpx.Request):
        calls.append((request.method, "raw"))
        assert "authorization" not in request.headers  # key never sent to S3
        if request.method == "PUT":
            return httpx.Response(200)
        return httpx.Response(200, content=jpeg((10, 10, 10)))

    return YouCamClient(http=httpx.AsyncClient(base_url="https://api.test", transport=httpx.MockTransport(api),
                                               headers={"Authorization": "Bearer test"}),
                        raw=httpx.AsyncClient(transport=httpx.MockTransport(raw)))


async def test_live_path_upload_task_poll_cache_and_ledger(db, monkeypatch):
    monkeypatch.setattr(get_settings(), "MOCK_MODE", False)
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY", "test")
    calls = []
    client = fake_youcam(ex("clothes_poll.json"), calls)
    src, garment = jpeg((1, 2, 3)), jpeg((4, 5, 6))
    spent0 = await ledger.units_spent(db)

    async def body(src_id, refs):  # noqa
        pass

    r = await service.run_feature(db, "cloth", src, {"garment_category": "full_body"}, refs={"garment": garment},
                                  build_body=lambda s, refs: {"src_file_id": s, "ref_file_id": refs["garment"], "garment_category": "full_body"},
                                  client=client)
    assert r.units == 2 and not r.cache_hit and r.image_path
    assert ("POST", "/s2s/v2.0/task/cloth-v4") in calls and ("GET", "/s2s/v2.0/task/cloth-v4/t-123") in calls
    assert sum(1 for c in calls if c == ("PUT", "raw")) == 2
    assert await ledger.units_spent(db) == spent0 + 2

    # same inputs -> cache hit, 0 units, no HTTP
    n = len(calls)
    again = await service.run_feature(db, "cloth", src, {"garment_category": "full_body"}, refs={"garment": garment}, client=client)
    assert again.cache_hit and len(calls) == n and await ledger.units_spent(db) == spent0 + 2


async def test_engine_error_is_not_charged(db, monkeypatch):
    monkeypatch.setattr(get_settings(), "MOCK_MODE", False)
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY", "test")
    calls = []
    poll = {"status": 200, "data": {"task_status": "error", "error": "error_no_face", "error_message": "no face"}}
    client = fake_youcam(poll, calls)
    spent0 = await ledger.units_spent(db)
    with pytest.raises(YouCamError) as e:
        await service.run_feature(db, "makeup", jpeg((9, 9, 9)), {"version": "1.0", "effects": []}, client=client)
    assert e.value.code == "error_no_face" and e.value.engine
    assert await ledger.units_spent(db) == spent0


async def test_http_errors_parse_all_401_variants():
    from app.youcam.client import _raise_for
    for body in ({"status": 401, "error": "Invalid API key"}, {"status": 401, "error_code": "InactiveApiKey"},
                 {"status": 401, "error": "Unauthorized", "error_code": "InvalidAccessToken"}):
        with pytest.raises(YouCamError) as e:
            _raise_for(httpx.Response(401, json=body))
        assert e.value.http_status == 401 and e.value.code
    with pytest.raises(YouCamError) as e:
        _raise_for(httpx.Response(400, json=ex("error_400_credit_insufficiency.json")))
    assert e.value.code == "CreditInsufficiency"


async def test_budget_refusal_blocks_live_call(db, monkeypatch):
    monkeypatch.setattr(get_settings(), "MOCK_MODE", False)
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY", "test")
    monkeypatch.setattr(get_settings(), "YOUCAM_UNIT_BUDGET", 21)  # spendable 1
    calls = []
    with pytest.raises(ledger.BudgetExceeded):
        await service.run_feature(db, "skin_tone", jpeg((7, 7, 7)), {}, client=fake_youcam({}, calls))
    assert calls == []


async def test_account_reserve_guard_blocks_even_when_ledger_has_room(db, monkeypatch):
    """Dev and prod ledgers are separate; the real account balance protects the judging reserve."""
    monkeypatch.setattr(get_settings(), "MOCK_MODE", False)
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY", "test")
    calls = []
    with pytest.raises(ledger.BudgetExceeded):  # account has 21, reserve is 20, cloth costs 2
        await service.run_feature(db, "cloth", jpeg((3, 3, 3)), {"garment_category": "full_body"},
                                  refs={"garment": jpeg((4, 4, 4))}, client=fake_youcam({}, calls, balance=21))
    assert not any(c[1].startswith("/s2s/v2.0/task") for c in calls)


async def test_switches_account_when_one_is_out_of_credit(db, monkeypatch):
    monkeypatch.setattr(get_settings(), "MOCK_MODE", False)
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY", "k1")
    monkeypatch.setattr(get_settings(), "YOUCAM_API_KEY_2", "k2")
    calls = {1: [], 2: []}

    def factory(account=1, **_):
        if account == 1:
            def api(request):
                calls[1].append(request.url.path)
                if request.url.path == "/s2s/v1.0/client/credit":
                    return httpx.Response(200, json={"status": 200, "results": [{"amount_dec": 900}]})
                if request.url.path == "/s2s/v2.0/file":
                    return httpx.Response(200, json=ex("file_create.json"))
                return httpx.Response(400, json={"status": 400, "error": "no credit", "error_code": "CreditInsufficiency"})
            c = YouCamClient(http=httpx.AsyncClient(base_url="https://a1.test", transport=httpx.MockTransport(api)),
                             raw=httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))), account=1)
            return c
        c = fake_youcam(ex("clothes_poll.json"), calls[2], balance=900)
        c.account = 2
        return c

    monkeypatch.setattr(service, "YouCamClient", factory)
    monkeypatch.setattr(service, "_turn", iter([0, 0, 0]))  # start with account 1
    r = await service.run_feature(db, "cloth", jpeg((5, 1, 1)), {"garment_category": "full_body"}, refs={"garment": jpeg((6, 1, 1))},
                                  build_body=lambda s, refs: {"src_file_id": s, "ref_file_id": refs["garment"], "garment_category": "full_body"})
    assert r.account == 2 and r.units == 2
    assert service._balances[1] == 0.0  # account 1 marked empty after CreditInsufficiency
