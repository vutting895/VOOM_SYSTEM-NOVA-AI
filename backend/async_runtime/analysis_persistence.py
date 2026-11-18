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
    _request("POST", "rpc/nova_create_analysis_job", {
        "p_id": task_id,
        "p_user_id": tenant_id,
        "p_connection_id": connection_id,
        "p_symbol": symbol,
        "p_timeframe": timeframe,
        "p_bar_count": bar_count,
    })


def update_job(*, task_id: str, tenant_id: str, status: str,
               result: dict[str, Any] | None = None, error_code: str | None = None) -> None:
    if status not in {"started", "completed", "failed"}:
        raise ValueError("invalid_analysis_job_status")
    _request("POST", "rpc/nova_update_analysis_job", {
        "p_job_id": task_id,
        "p_user_id": tenant_id,
        "p_status": status,
        "p_result": result,
        "p_error_code": error_code,
    })

def get_job(*, task_id: str, tenant_id: str, connection_id: str) -> dict[str, Any] | None:
    from urllib.parse import urlencode
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError

    base, key = _config()
    query = urlencode({
        "select": "id,user_id,connection_id,symbol,timeframe,status,result,error_code,created_at,started_at,finished_at",
        "id": f"eq.{task_id}",
        "user_id": f"eq.{tenant_id}",
        "connection_id": f"eq.{connection_id}",
        "limit": "1",
    })
    request = Request(
        f"{base}/rest/v1/nova_analysis_jobs?{query}",
        method="GET",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            rows = json.loads(response.read().decode("utf-8"))
            if not isinstance(rows, list):
                raise AnalysisPersistenceError("durable_analysis_store_invalid_response")
            return rows[0] if rows else None
    except HTTPError as exc:
        raise AnalysisPersistenceError(f"durable_analysis_store_http_{exc.code}") from exc
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        raise AnalysisPersistenceError("durable_analysis_store_unavailable") from exc
