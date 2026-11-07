"""Server-only persistence for durable NOVA analysis jobs via Supabase PostgREST.

Only the service role key is accepted here. Never import this module into browser code
or return its credentials to a caller.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Any


class AnalysisPersistenceError(RuntimeError):
    pass


def _config() -> tuple[str, str]:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise AnalysisPersistenceError("durable_analysis_store_not_configured")
    if not base.startswith("https://") and "localhost" not in base and "127.0.0.1" not in base:
        raise AnalysisPersistenceError("durable_analysis_store_requires_https")
    return base, key


def _request(method: str, table: str, payload: dict[str, Any], query: str = "") -> None:
    base, key = _config()
    url = f"{base}/rest/v1/{table}" + (f"?{query}" if query else "")
    body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urlopen(request, timeout=8) as response:
            if response.status not in (200, 201, 204):
                raise AnalysisPersistenceError("durable_analysis_store_rejected_write")
    except HTTPError as exc:
        raise AnalysisPersistenceError(f"durable_analysis_store_http_{exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise AnalysisPersistenceError("durable_analysis_store_unavailable") from exc


def create_job(*, task_id: str, tenant_id: str, connection_id: str,
               symbol: str, timeframe: str, bar_count: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    _request("POST", "nova_analysis_jobs", {
        "id": task_id,
        "user_id": tenant_id,
        "connection_id": connection_id,
        "symbol": symbol,
        "timeframe": timeframe,
        "status": "queued",
        "request_metadata": {"bar_count": bar_count, "source": "exness_mt5_demo"},
    }, query="on_conflict=id")
    record_event(task_id=task_id, tenant_id=tenant_id, event_type="queued",
                 details={"symbol": symbol, "timeframe": timeframe, "bar_count": bar_count})


def update_job(*, task_id: str, tenant_id: str, status: str,
               result: dict[str, Any] | None = None, error_code: str | None = None) -> None:
    if status not in {"started", "completed", "failed"}:
        raise ValueError("invalid_analysis_job_status")
    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {"status": status, "updated_at": now}
    if status == "started":
        payload["started_at"] = now
    elif status == "completed":
        payload.update({"result": result, "finished_at": now, "error_code": None})
    else:
        payload.update({"result": None, "finished_at": now, "error_code": error_code or "analysis_failed"})
    _request("PATCH", "nova_analysis_jobs", payload,
             query=f"id=eq.{task_id}&user_id=eq.{tenant_id}")
    record_event(task_id=task_id, tenant_id=tenant_id, event_type=status,
                 details={"error_code": error_code} if status == "failed" else {})


def record_event(*, task_id: str, tenant_id: str, event_type: str,
                 details: dict[str, Any]) -> None:
    _request("POST", "nova_analysis_audit_events", {
        "job_id": task_id,
        "user_id": tenant_id,
        "event_type": event_type,
        "details": details,
    })
