"""Authenticated HTTP boundary for the NOVA QuantLab queue.

User identity is revalidated with Supabase Auth. Until organization membership
is backed by a canonical tenant registry, each Supabase user is an isolated
tenant; this intentionally does not infer shared workspaces.
"""
from __future__ import annotations

import hmac
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from workers.quant_engine.queue_store import (
    QueueConflict, QueueNotFound, SQLiteQuantLabQueue,
)

router = APIRouter()
_JOB_TYPES = {"dataset.validate", "backtest", "train", "evaluate"}
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
_WORKER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$")


def queue() -> SQLiteQuantLabQueue:
    path = os.getenv("QUANTLAB_DB_PATH", "/data/nova-quantlab/quantlab.sqlite3")
    try:
        return SQLiteQuantLabQueue(path)
    except (OSError, ValueError):
        raise HTTPException(status_code=503, detail="quantlab_storage_not_configured") from None


def authenticated_user(authorization: str | None) -> dict[str, str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="authentication_required")
    token = authorization[7:].strip()
    if not token or len(token) > 8192:
        raise HTTPException(status_code=401, detail="invalid_session")
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
    if not base or not key:
        raise HTTPException(status_code=503, detail="authentication_not_configured")
    if not base.startswith("https://"):
        raise HTTPException(status_code=503, detail="authentication_not_configured")
    try:
        response = httpx.get(
            base + "/auth/v1/user",
            headers={"apikey": key, "Authorization": "Bearer " + token, "Accept": "application/json"},
            timeout=5.0,
            follow_redirects=False,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="authentication_provider_unavailable") from None
    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="invalid_or_expired_session")
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="authentication_provider_unavailable")
    try:
        user = response.json()
    except ValueError:
        raise HTTPException(status_code=503, detail="authentication_provider_invalid_response") from None
    if not isinstance(user, dict) or not isinstance(user.get("id"), str) or not user["id"]:
        raise HTTPException(status_code=401, detail="invalid_or_expired_session")
    return {"user_id": user["id"], "tenant_id": user["id"]}


def dispatcher_auth(value: str | None) -> None:
    expected = os.getenv("QUANTLAB_DISPATCHER_TOKEN", "")
    if not expected or not value or not hmac.compare_digest(value, expected):
        raise HTTPException(status_code=401, detail="dispatcher_authentication_required")


def _validate_experiment_tree(value: Any, *, depth: int = 0) -> None:
    if depth > 8:
        raise ValueError("experiment_nesting_too_deep")
    if isinstance(value, dict):
        if len(value) > 100:
            raise ValueError("experiment_has_too_many_fields")
        for key, child in value.items():
            if not isinstance(key, str) or not key or len(key) > 128:
                raise ValueError("experiment_has_invalid_key")
            normalized = "".join(char for char in key.lower() if char.isalnum())
            if any(part in normalized for part in ("tenantid", "requesterid", "actorid", "token",
                                                    "password", "secret", "credential", "broker",
                                                    "account", "connectionid", "order", "execution")):
                raise ValueError("experiment_contains_forbidden_field")
            _validate_experiment_tree(child, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > 100:
            raise ValueError("experiment_has_too_many_items")
        for child in value:
            _validate_experiment_tree(child, depth=depth + 1)
    elif isinstance(value, str):
        if len(value) > 4096:
            raise ValueError("experiment_string_too_large")
    elif value is None or isinstance(value, (bool, int, float)):
        if isinstance(value, float) and not __import__("math").isfinite(value):
            raise ValueError("experiment_contains_non_finite_number")
    else:
        raise ValueError("experiment_contains_non_json_value")


class CreateJob(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_type: str
    resource_profile: str = "free-cpu"
    timeout_seconds: int = Field(default=900, ge=1, le=900)
    experiment: dict[str, Any]

    @model_validator(mode="after")
    def validate_experiment(self):
        _validate_experiment_tree(self.experiment)
        if len(self.model_dump_json().encode("utf-8")) > 65_536:
            raise ValueError("request_body_too_large")
        return self


class ClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    worker_id: str
    lease_seconds: int = Field(default=30, ge=10, le=120)


class HeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    worker_id: str
    lease_token: str = Field(min_length=32, max_length=256)
    lease_seconds: int = Field(default=30, ge=10, le=120)


class FinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    worker_id: str
    lease_token: str = Field(min_length=32, max_length=256)
    state: str
    error_code: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")
    result: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_result(self):
        if self.state == "SUCCEEDED" and not isinstance(self.result, dict):
            raise ValueError("result_required_for_success")
        if self.result is not None and len(self.model_dump_json().encode("utf-8")) > 262_144:
            raise ValueError("result_too_large")
        return self


@router.get("/v1/jobs")
def list_jobs(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    state: str = Query(default="", max_length=20),
    cursor: str = Query(default="", max_length=256),
) -> dict[str, Any]:
    user = authenticated_user(authorization)
    allowed = {"QUEUED", "VALIDATING", "RUNNING", "FINALIZING", "SUCCEEDED", "REJECTED", "FAILED", "CANCELLED", "TIMED_OUT"}
    if state and state not in allowed:
        raise HTTPException(status_code=400, detail="invalid_job_state")
    try:
        return queue().list(tenant_id=user["tenant_id"], limit=limit, state=state, cursor=cursor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/v1/jobs", status_code=202)
def create_job(
    payload: CreateJob,
    authorization: str | None = Header(default=None),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    user = authenticated_user(authorization)
    if not idempotency_key or not _KEY.fullmatch(idempotency_key):
        raise HTTPException(status_code=400, detail="valid_idempotency_key_required")
    if payload.job_type not in _JOB_TYPES:
        raise HTTPException(status_code=400, detail="invalid_quant_job_request")
    if payload.resource_profile != "free-cpu":
        raise HTTPException(status_code=400, detail="invalid_quant_job_request")
    if not payload.experiment or len(str(payload.experiment).encode("utf-8")) > 64_000:
        raise HTTPException(status_code=400, detail="invalid_quant_job_request")
    try:
        job, replayed = queue().create(
            tenant_id=user["tenant_id"], requester_id=user["user_id"],
            job_type=payload.job_type, payload=payload.model_dump(),
            timeout_seconds=payload.timeout_seconds, idempotency_key=idempotency_key,
        )
    except QueueConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="invalid_quant_job_request") from None
    return {"job": job, "replayed": replayed, "ordersEnabled": False,
            "executionEnabled": False, "liveTradingEnabled": False}


@router.get("/v1/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = authenticated_user(authorization)
    if not _ID.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="invalid_job_id")
    try:
        return {"job": queue().get(tenant_id=user["tenant_id"], job_id=job_id)}
    except QueueNotFound:
        raise HTTPException(status_code=404, detail="job_not_found") from None


@router.get("/v1/jobs/{job_id}/events")
def get_events(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = authenticated_user(authorization)
    if not _ID.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="invalid_job_id")
    try:
        return queue().events(tenant_id=user["tenant_id"], job_id=job_id)
    except QueueNotFound:
        raise HTTPException(status_code=404, detail="job_not_found") from None


@router.post("/v1/internal/leases/claim")
def claim_job(payload: ClaimRequest, dispatcher_token: str | None = Header(default=None, alias="X-QuantLab-Dispatcher-Token")) -> dict[str, Any]:
    dispatcher_auth(dispatcher_token)
    if not _WORKER_ID.fullmatch(payload.worker_id):
        raise HTTPException(status_code=400, detail="invalid_worker_id")
    claimed = queue().claim(worker_id=payload.worker_id, lease_seconds=payload.lease_seconds)
    return {"claim": claimed}


@router.post("/v1/internal/leases/{job_id}/heartbeat")
def heartbeat_job(job_id: str, payload: HeartbeatRequest,
                  dispatcher_token: str | None = Header(default=None, alias="X-QuantLab-Dispatcher-Token")) -> dict[str, Any]:
    dispatcher_auth(dispatcher_token)
    try:
        expiry = queue().heartbeat(job_id=job_id, worker_id=payload.worker_id,
                                   lease_token=payload.lease_token, lease_seconds=payload.lease_seconds)
        return {"job_id": job_id, "lease_expires_at": expiry}
    except QueueConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/v1/internal/leases/{job_id}/finish")
def finish_job(job_id: str, payload: FinishRequest,
               dispatcher_token: str | None = Header(default=None, alias="X-QuantLab-Dispatcher-Token")) -> dict[str, Any]:
    dispatcher_auth(dispatcher_token)
    try:
        job = queue().finish(job_id=job_id, worker_id=payload.worker_id,
                             lease_token=payload.lease_token, state=payload.state,
                             error_code=payload.error_code, result=payload.result)
        return {"job": job}
    except QueueNotFound:
        raise HTTPException(status_code=404, detail="job_not_found") from None
    except QueueConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
