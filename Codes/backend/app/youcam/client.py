"""Low-level YouCam HTTP client (live mode only). Shapes per docs/API_NOTES.md §2–§4.

uploadFile(bytes) -> file_id · startTask(feature, body) -> task_id ·
pollTask(feature, task_id) -> TaskResult · getCreditBalance() -> float
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import get_settings
from app.youcam.features import CREDIT_PATH, FEATURES, FILE_PATH, TEMPLATE_PATHS
from app.youcam.polling import poll_until


class YouCamError(RuntimeError):
    """code: HTTP error_code (InvalidParameters, CreditInsufficiency, InvalidApiKey…) or engine error (error_no_face…)."""

    def __init__(self, code: str, message: str, http_status: int | None = None, engine: bool = False):
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.http_status, self.engine = code, message, http_status, engine

    @property
    def retryable(self) -> bool:
        return self.http_status in (429, 500, 502, 503, 504) or self.code in ("TaskTimeout", "unknown_internal_error")


@dataclass
class TaskResult:
    status: str                      # running | success | error
    url: str | None = None           # image features
    results: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    error_message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def _raise_for(resp: httpx.Response) -> dict:
    try:
        body = resp.json()
    except ValueError:
        body = {"error": resp.text[:300]}
    if resp.status_code >= 400 or (isinstance(body, dict) and body.get("status", 200) >= 400):
        # Three 401 variants and the 400 family all carry error and/or error_code (API_NOTES §3).
        code = body.get("error_code") or body.get("error") or f"HTTP{resp.status_code}"
        raise YouCamError(str(code), str(body.get("error") or code), resp.status_code)
    return body


def mime_for(data: bytes) -> tuple[str, str]:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    return "image/jpg", "jpg"  # docs examples use image/jpg


class YouCamClient:
    def __init__(self, http: httpx.AsyncClient | None = None, raw: httpx.AsyncClient | None = None, account: int = 1):
        s = get_settings()
        keys = s.youcam_keys
        if not keys or account > len(keys):
            raise YouCamError("NoApiKey", f"YouCam account {account} is not configured")
        self.account = account
        self._http = http or httpx.AsyncClient(
            base_url=s.YOUCAM_API_BASE_URL,
            headers={"Authorization": f"Bearer {keys[account - 1]}"},
            timeout=httpx.Timeout(30, connect=10),
        )
        # Unauthenticated client for presigned PUTs and result downloads (never send the API key there).
        self._raw = raw or httpx.AsyncClient(timeout=60, follow_redirects=True)

    async def aclose(self) -> None:
        await self._http.aclose()
        await self._raw.aclose()

    async def get_credit_balance(self) -> float:
        body = _raise_for(await self._http.get(CREDIT_PATH))
        return float(sum(lot.get("amount_dec", lot.get("amount", 0)) for lot in body.get("results") or []))

    async def upload_file(self, data: bytes, file_name: str | None = None) -> str:
        if len(data) > 10 * 1024 * 1024:
            raise YouCamError("exceed_max_filesize", "image larger than 10 MB")
        content_type, ext = mime_for(data)
        payload = {"files": [{"content_type": content_type, "file_name": file_name or f"upload.{ext}", "file_size": len(data)}]}
        body = _raise_for(await self._http.post(FILE_PATH, json=payload))
        f = body["data"]["files"][0]
        req = f["requests"][0]
        # Presigned URL: send exactly the returned headers, no auth header.
        put = await self._raw.request(req.get("method", "PUT"), req["url"], content=data, headers=req.get("headers") or {})
        if put.status_code >= 300:
            raise YouCamError("error_upload", f"presigned PUT failed: {put.status_code}", put.status_code)
        return f["file_id"]

    async def start_task(self, feature: str, body: dict) -> str:
        f = FEATURES[feature]
        resp = _raise_for(await self._http.post(f.task_path, json=body))
        return resp["data"]["task_id"]

    async def poll_task(self, feature: str, task_id: str) -> TaskResult:
        f = FEATURES[feature]
        body = _raise_for(await self._http.get(f"{f.task_path}/{task_id}"))
        data = body.get("data") or {}
        results = data.get("results")
        url = None
        if isinstance(results, dict):
            url = results.get("url")
        elif isinstance(results, str):  # skin-analysis zip example returns a bare string
            url, results = results, {"url": results}
        return TaskResult(status=data.get("task_status", "running"), url=url, results=results or {},
                          error=data.get("error"), error_message=data.get("error_message"), raw=body)

    async def wait_task(self, feature: str, task_id: str, on_tick=None, sleep=None, total: float | None = None) -> TaskResult:
        # Docs suggest ~10 s polling; spec §7.4 asks 1.5 s→6 s cap within 90 s. 250 req/300 s limit leaves room.
        # Units are charged when a task succeeds, even if we stopped waiting — so wait generously.
        limit = total or (480 if feature == "image_gen" else 300)
        res = await poll_until(lambda: self.poll_task(feature, task_id), lambda r: r.status in ("success", "error"),
                               on_tick=on_tick, total=limit, cap=10 if feature == "image_gen" else 6,
                               **({"sleep": sleep} if sleep else {}))
        if res.status == "error":
            raise YouCamError(res.error or "unknown_internal_error", res.error_message or "", engine=True)
        return res

    async def list_templates(self, feature: str) -> dict:
        return _raise_for(await self._http.get(TEMPLATE_PATHS[feature], params={"page_size": 50}))

    async def download(self, url: str) -> bytes:
        r = await self._raw.get(url)
        r.raise_for_status()
        return r.content
