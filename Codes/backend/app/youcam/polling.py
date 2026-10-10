"""Exponential-backoff polling (spec §7.4): start 1.5s, x1.5 each try, cap 6s, give up at 90s."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")


class PollTimeout(TimeoutError):
    pass


def backoff_delays(start: float = 1.5, factor: float = 1.5, cap: float = 6.0, total: float = 90.0):
    elapsed, d = 0.0, start
    while elapsed + d <= total:
        yield d
        elapsed += d
        d = min(d * factor, cap)


async def poll_until(
    fetch: Callable[[], Awaitable[T]],
    is_done: Callable[[T], bool],
    *,
    start: float = 1.5, cap: float = 6.0, total: float = 90.0,
    on_tick: Callable[[T], Awaitable[None]] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    """Cancellable: cancelling the awaiting task cancels the sleep."""
    t0 = time.monotonic()
    for delay in backoff_delays(start, 1.5, cap, total):
        await sleep(delay)
        result = await fetch()
        if on_tick:
            await on_tick(result)
        if is_done(result):
            return result
    raise PollTimeout(f"task not finished after {time.monotonic() - t0:.0f}s")
