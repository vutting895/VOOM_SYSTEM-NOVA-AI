"""Private HTTP ingress for the NOVA System Hub -> Celery dispatch path.

This service is not a public user API. Put it behind an authenticated private
ingress (for example, a Cloudflare Tunnel with an allowlisted Hub origin) and
configure a high-entropy NOVA_ANALYSIS_INTERNAL_TOKEN.
"""

from __future__ import annotations

import hmac
import os
import re
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException
from celery.result import AsyncResult

from bot_state import get_redis_client
from celery_app import celery_app
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from tasks import scan_market_smc

app = FastAPI(
    title="NOVA Internal Analysis Dispatcher",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_SYMBOL_RE = re.compile(r"^[A-Za-z0-9._/-]{2,32}$")
_TIMEFRAME_RE = re.compile(r"^(1m|5m|15m|30m|1h|4h|1d|1w)$")


class OHLCBar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: str
    open: float = Field(gt=0, allow_inf_nan=False)
    high: float = Field(gt=0, allow_inf_nan=False)
    low: float = Field(gt=0, allow_inf_nan=False)
    close: float = Field(gt=0, allow_inf_nan=False)
    volume: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValueError("timestamp must be ISO-8601") from exc
        if parsed.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        return parsed.isoformat().replace("+00:00", "Z")

    @model_validator(mode="after")
    def validate_ohlc(self) -> "OHLCBar":
        if self.high < max(self.open, self.close, self.low):
            raise ValueError("high is inconsistent")
        if self.low > min(self.open, self.close, self.high):
            raise ValueError("low is inconsistent")
        return self


class DispatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    connection_id: str
    symbol: str = Field(min_length=2, max_length=32)
    timeframe: str
    bars: list[OHLCBar] = Field(min_length=25, max_length=500)
    last_bar_closed: bool
    source_metadata: dict[str, str]

    @field_validator("tenant_id", "connection_id")
    @classmethod
    def validate_uuid(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("must be a UUID") from exc

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not _SYMBOL_RE.fullmatch(normalized):
            raise ValueError("invalid symbol")
        return normalized

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _TIMEFRAME_RE.fullmatch(normalized):
            raise ValueError("unsupported timeframe")
        return normalized

    @field_validator("last_bar_closed")
    @classmethod
    def require_closed_bar(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("only confirmed closed bars can be dispatched")
        return value

    @field_validator("source_metadata")
    @classmethod
    def validate_source_metadata(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {"provider", "connection_id", "fetched_at", "source_as_of"}
        required = {"provider", "connection_id", "fetched_at", "source_as_of"}
        if set(value) - allowed or not required.issubset(value):
            raise ValueError("invalid source metadata fields")
        if value.get("provider") != "exness_mt5_demo":
            raise ValueError("unsupported market data provider")
        if any(not isinstance(item, str) or not item or len(item) > 128 for item in value.values()):
            raise ValueError("source metadata values must be bounded non-empty strings")
        return value

    @model_validator(mode="after")
    def validate_connection_provenance(self) -> "DispatchRequest":
        if self.source_metadata["connection_id"] != self.connection_id:
            raise ValueError("source connection must match the authorized connection")
        previous = None
        for bar in self.bars:
            current = datetime.fromisoformat(bar.timestamp.replace("Z", "+00:00"))
            if previous is not None and current <= previous:
                raise ValueError("bars must be strictly chronological")
            previous = current
        return self


def _authorize_internal(authorization: str | None) -> None:
    expected = os.environ.get("NOVA_ANALYSIS_INTERNAL_TOKEN", "")
    if not expected or len(expected) < 32:
        raise HTTPException(status_code=503, detail="internal_dispatch_not_configured")
    supplied = authorization or ""
    if not supplied.startswith("Bearer ") or not hmac.compare_digest(
        supplied[7:], expected
    ):
        raise HTTPException(status_code=401, detail="internal_authentication_required")


@app.get("/health")
def health() -> dict[str, Any]:
    # No Redis/provider readiness is inferred from process liveness.
    return {
        "ok": True,
        "service": "nova-analysis-dispatcher",
        "mode": "internal-read-only",
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }



@app.get("/internal/v1/analysis/tasks/{task_id}")
def get_analysis_task(
    task_id: str,
    tenant_id: str,
    connection_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Return a task state/result only to the tenant/connection that queued it."""
    _authorize_internal(authorization)
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", task_id):
        raise HTTPException(status_code=400, detail="invalid_task_id")
    try:
        import json
        raw_owner = get_redis_client().get(f"nova:task-owner:{task_id}")
        owner = json.loads(raw_owner) if raw_owner else None
    except Exception as exc:
        raise HTTPException(status_code=503, detail="task_status_unavailable") from exc
    if not owner or not hmac.compare_digest(str(owner.get("tenant_id", "")), tenant_id) or not hmac.compare_digest(str(owner.get("connection_id", "")), connection_id):
        raise HTTPException(status_code=404, detail="analysis_task_not_found")

    result = AsyncResult(task_id, app=celery_app)
    state = result.state
    response: dict[str, Any] = {
        "task_id": task_id,
        "status": state,
        "ready": result.ready(),
        "successful": result.successful() if result.ready() else False,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
    if result.successful():
        response["result"] = result.result
    elif result.failed():
        response["error"] = "analysis_task_failed"
    return response

@app.post("/internal/v1/analysis/smc", status_code=202)
def dispatch_smc(
    payload: DispatchRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _authorize_internal(authorization)

    # The tenant UUID is derived by the authenticated System Hub. No browser
    # token, provider credential, bridge token or account snapshot is forwarded.
    source_metadata = {
        "provider": payload.source_metadata["provider"],
        "connection_id": payload.connection_id,
        "fetched_at": payload.source_metadata["fetched_at"],
        "source_as_of": payload.source_metadata["source_as_of"],
    }
    task = scan_market_smc.delay(
        payload.symbol,
        payload.timeframe,
        [bar.model_dump() for bar in payload.bars],
        last_bar_closed=True,
        tenant_id=payload.tenant_id,
        source_metadata=source_metadata,
    )
    # Bind the task ID to its authorized owner and connection before returning.
    import json
    owner_record = json.dumps(
        {"tenant_id": payload.tenant_id, "connection_id": payload.connection_id},
        separators=(",", ":"),
    )
    get_redis_client().setex(f"nova:task-owner:{task.id}", 3600, owner_record)
    return {
        "task_id": task.id,
        "status": "QUEUED",
        "symbol": payload.symbol,
        "timeframe": payload.timeframe,
        "bar_count": len(payload.bars),
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
