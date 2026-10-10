import pytest

from app.youcam.cache import cache_key
from app.youcam.polling import PollTimeout, backoff_delays, poll_until


def test_cache_key_is_order_independent_for_params_and_sensitive_to_inputs():
    a = cache_key("cloth", "img1", {"garment_category": "full_body", "x": 1})
    b = cache_key("cloth", "img1", {"x": 1, "garment_category": "full_body"})
    assert a == b and len(a) == 64
    assert a != cache_key("cloth", "img2", {"x": 1, "garment_category": "full_body"})
    assert a != cache_key("necklace", "img1", {"x": 1, "garment_category": "full_body"})


def test_backoff_schedule():
    d = list(backoff_delays())
    assert d[0] == 1.5 and max(d) == 6.0 and sum(d) <= 90


async def test_poll_until_done_and_timeout():
    calls = {"n": 0}

    async def fetch():
        calls["n"] += 1
        return "success" if calls["n"] == 3 else "running"

    async def nosleep(_):
        return None

    assert await poll_until(fetch, lambda s: s == "success", sleep=nosleep) == "success"

    async def never():
        return "running"

    with pytest.raises(PollTimeout):
        await poll_until(never, lambda s: s == "success", sleep=nosleep)
