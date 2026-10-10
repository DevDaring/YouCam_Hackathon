"""LLM client: provider fallback and JSON enforcement, against a fake OpenAI-compatible server."""
import json

import httpx
import pytest
from pydantic import BaseModel

from app.agent import llm
from app.config import get_settings


class Item(BaseModel):
    layer: str
    change: str


def reply(content, status=200):
    return httpx.Response(status, json={"choices": [{"message": {"content": content}}], "usage": {"total_tokens": 10}})


@pytest.fixture(autouse=True)
def _keys(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "DEEPSEEK_API_KEY", "k1")
    monkeypatch.setattr(s, "DEEPSEEK_API_KEY_2", "k2")
    monkeypatch.setattr(s, "KIMI_API_KEY", "k3")
    monkeypatch.setattr(s, "LLM_PROVIDER_ORDER", "deepseek,kimi")


def client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_provider_chain_order_and_kimi_constraints():
    chain = llm.providers()
    assert [(p.name, p.api_key) for p in chain] == [("deepseek", "k1"), ("deepseek", "k2"), ("kimi", "k3")]
    assert chain[0].model == "deepseek-flash"
    assert chain[2].fixed_temperature == 1.0 and chain[2].min_max_tokens >= 4000


async def test_falls_back_on_auth_error_then_empty_reply():
    seen = []

    def handler(req: httpx.Request):
        key = req.headers["authorization"].split()[-1]
        body = json.loads(req.content)
        seen.append((key, body["temperature"], body["max_tokens"]))
        if key == "k1":
            return httpx.Response(402, json={"error": "Insufficient Balance"})
        if key == "k2":
            return reply("")  # reasoning ate the budget
        return reply('{"layer":"necklace","change":"lighter"}')

    item, res = await llm.chat_json([{"role": "user", "content": "x"}], Item, http=client(handler))
    assert item == Item(layer="necklace", change="lighter")
    assert res.provider == "kimi"
    assert seen[-1][1] == 1.0 and seen[-1][2] >= 4000  # Kimi gets fixed temperature + room to think


async def test_invalid_json_retried_once_then_raises_with_raw():
    calls = {"n": 0}

    def fixed(req):
        calls["n"] += 1
        return reply('```json\n{"layer":"necklace","change":"lighter"}\n```' if calls["n"] == 2 else '{"layer": 3}')

    item, _ = await llm.chat_json([{"role": "user", "content": "x"}], Item, http=client(fixed))
    assert item.change == "lighter" and calls["n"] == 2

    with pytest.raises(llm.LLMInvalidOutput) as e:
        await llm.chat_json([{"role": "user", "content": "x"}], Item, http=client(lambda r: reply("not json")))
    assert e.value.raw == "not json"


async def test_all_providers_failing_raises():
    with pytest.raises(llm.LLMError, match="all LLM providers failed"):
        await llm.chat([{"role": "user", "content": "x"}], http=client(lambda r: httpx.Response(503)))
