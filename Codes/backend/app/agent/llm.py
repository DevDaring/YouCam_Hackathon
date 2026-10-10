"""Language-model client for agent, translation and rewording tasks (D-008).

OpenAI-compatible chat completions against cheap providers, tried in order:
DeepSeek (key 1 → key 2) → Kimi. A provider is skipped on auth/credit/rate/server errors,
timeouts, or an empty reply (reasoning models can spend the whole budget thinking).

chat_json() enforces a pydantic schema: invalid output is retried once with the validation
error fed back, then raised as LLMInvalidOutput carrying the raw text (spec §8.2).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import get_settings

log = logging.getLogger("dearme.llm")
T = TypeVar("T", bound=BaseModel)
SKIP_STATUS = {401, 402, 403, 404, 408, 409, 429, 500, 502, 503, 504}


class LLMError(RuntimeError):
    pass


class LLMInvalidOutput(LLMError):
    def __init__(self, message: str, raw: str):
        super().__init__(message)
        self.raw = raw


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    fixed_temperature: float | None = None  # some reasoning models accept only one value
    min_max_tokens: int = 0                 # reasoning models need room to think before answering


@dataclass
class ChatResult:
    content: str
    provider: str
    model: str
    usage: dict[str, Any] = field(default_factory=dict)
    tool_calls: list[dict] = field(default_factory=list)


def providers() -> list[Provider]:
    s = get_settings()
    out: list[Provider] = []
    for name in (n.strip() for n in s.LLM_PROVIDER_ORDER.split(",")):
        if name == "deepseek":
            for key in (s.DEEPSEEK_API_KEY, s.DEEPSEEK_API_KEY_2):
                if key:
                    out.append(Provider("deepseek", s.DEEPSEEK_API_BASE_URL, key, s.DEEPSEEK_MODEL))
        elif name == "kimi" and s.KIMI_API_KEY:
            # Live test 2026-10-10: kimi-k2.6 rejects temperature != 1 and spends ~2k tokens reasoning.
            out.append(Provider("kimi", s.KIMI_API_BASE_URL, s.KIMI_API_KEY, s.KIMI_MODEL,
                                fixed_temperature=1.0, min_max_tokens=4000))
    return out


async def chat(
    messages: list[dict],
    *,
    json_mode: bool = False,
    max_tokens: int = 800,
    temperature: float = 0.2,
    tools: list[dict] | None = None,
    http: httpx.AsyncClient | None = None,
) -> ChatResult:
    chain = providers()
    if not chain:
        raise LLMError("no LLM provider configured (DEEPSEEK_API_KEY / KIMI_API_KEY)")
    own = http is None
    http = http or httpx.AsyncClient(timeout=get_settings().LLM_TIMEOUT_S)
    errors: list[str] = []
    try:
        for p in chain:
            body: dict[str, Any] = {
                "model": p.model,
                "messages": messages,
                "max_tokens": max(max_tokens, p.min_max_tokens),
                "temperature": p.fixed_temperature if p.fixed_temperature is not None else temperature,
            }
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            if tools:
                body["tools"] = tools
            try:
                r = await http.post(f"{p.base_url}/chat/completions", json=body,
                                    headers={"Authorization": f"Bearer {p.api_key}"})
            except httpx.HTTPError as e:
                errors.append(f"{p.name}/{p.model}: {type(e).__name__}")
                continue
            if r.status_code in SKIP_STATUS or r.status_code >= 400:
                errors.append(f"{p.name}/{p.model}: HTTP {r.status_code}")
                if r.status_code not in SKIP_STATUS:
                    raise LLMError(f"{p.name} rejected the request: {r.text[:300]}")
                continue
            msg = (r.json().get("choices") or [{}])[0].get("message") or {}
            content = (msg.get("content") or "").strip()
            tool_calls = msg.get("tool_calls") or []
            if not content and not tool_calls:
                errors.append(f"{p.name}/{p.model}: empty reply")
                continue
            return ChatResult(content, p.name, p.model, r.json().get("usage") or {}, tool_calls)
    finally:
        if own:
            await http.aclose()
    raise LLMError("all LLM providers failed: " + "; ".join(errors))


def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("\n") + 1:] if "\n" in text else text
    start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=-1)
    if start < 0:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:text.rfind("}" if text[start] == "{" else "]") + 1])


async def chat_json(
    messages: list[dict],
    schema: type[T],
    *,
    max_tokens: int = 800,
    temperature: float = 0.2,
    http: httpx.AsyncClient | None = None,
) -> tuple[T, ChatResult]:
    res = await chat(messages, json_mode=True, max_tokens=max_tokens, temperature=temperature, http=http)
    try:
        return schema.model_validate(_extract_json(res.content)), res
    except (ValueError, ValidationError) as first:
        log.info("LLM JSON invalid (%s), retrying once", type(first).__name__)
        retry = [*messages, {"role": "assistant", "content": res.content},
                 {"role": "user", "content": f"That reply was not valid for the required JSON schema: {str(first)[:500]}. "
                                             "Reply again with ONLY the corrected JSON object."}]
        res2 = await chat(retry, json_mode=True, max_tokens=max_tokens, temperature=temperature, http=http)
        try:
            return schema.model_validate(_extract_json(res2.content)), res2
        except (ValueError, ValidationError) as second:
            raise LLMInvalidOutput(f"LLM output invalid after retry: {second}", raw=res2.content) from second
