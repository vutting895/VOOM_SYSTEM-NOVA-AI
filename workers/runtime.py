"""Isolated NOVA research runtime. All routes are research/approval-only; no broker orders."""
from __future__ import annotations
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from workers.feature.smc_wave.smc_strategy import analyze_smc, run_smc_backtest
from workers.feature.elliott_wave.elliott_wave import analyze_elliott_wave
from workers.backtest.walk_forward import run_walk_forward
from workers.risk.manager_prototype import RiskWorker
from workers.quant.mt5_decision_adapter import evaluate_mt5_event
from workers.risk.mt5_decision_gate import evaluate_mt5_risk

app = FastAPI(title="VOOM NOVA Research Worker", version="0.3.0")


class BacktestRequest(BaseModel):
    candles: list[dict[str, Any]] = Field(min_length=10)
    reward_risk: float = Field(default=2.0, ge=0.5, le=5.0)
    fee_rate: float = Field(default=0.001, ge=0, lt=0.05)
    slippage_rate: float = Field(default=0.0005, ge=0, lt=0.05)
    initial_equity: float = Field(default=10000.0, gt=0)


class WalkForwardRequest(BaseModel):
    candles: list[dict[str, Any]] = Field(min_length=30)
    train_bars: int = Field(default=60, ge=20)
    test_bars: int = Field(default=30, ge=10)
    step_bars: int | None = Field(default=None, ge=1)
    warmup_bars: int = Field(default=30, ge=10)
    reward_risk: float = Field(default=2.0, ge=0.5, le=5.0)
    fee_rate: float = Field(default=0.001, ge=0, lt=0.05)
    slippage_rate: float = Field(default=0.0005, ge=0, lt=0.05)


class MT5QuantDecisionRequest(BaseModel):
    event: dict[str, Any]
    execution_enabled: bool = False


class MT5RiskGateRequest(BaseModel):
    event: dict[str, Any]
    quant_engine_result: dict[str, Any]


class RiskApprovalRequest(BaseModel):
    thread_id: str
    proposal: dict[str, Any]
    allocation_pct: float
    daily_loss_pct: float
    drawdown_pct: float
    leverage: float = 1.0
    data_age_seconds: float = 0.0
    market_open: bool = True
    expires_in_minutes: int = Field(default=10, ge=2, le=15)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "research-worker", "version": "0.3.0",
            "orders_enabled": False, "live_trading_enabled": False}


@app.post("/v1/smc/analyze")
def smc_analyze(payload: BacktestRequest) -> dict[str, Any]:
    try:
        return analyze_smc(payload.candles, include_full_history=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/smc/backtest")
def smc_backtest(payload: BacktestRequest) -> dict[str, Any]:
    try:
        return run_smc_backtest(payload.candles, reward_risk=payload.reward_risk,
            fee_rate=payload.fee_rate, slippage_rate=payload.slippage_rate,
            initial_equity=payload.initial_equity)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/elliott-wave/analyze")
def elliott_wave_analyze(payload: BacktestRequest) -> dict[str, Any]:
    try:
        return analyze_elliott_wave(payload.candles)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/research/pipeline")
def research_pipeline(payload: BacktestRequest) -> dict[str, Any]:
    try:
        smc = analyze_smc(payload.candles)
        elliott = analyze_elliott_wave(payload.candles)
        return {"ok": True, "pipeline": "smc_elliott_research_v1",
                "smc": smc, "elliott_wave": elliott,
                "confluence": {"smc_bias": smc["structure_bias"],
                    "elliott_direction": (elliott.get("latest_candidate") or {}).get("direction"),
                    "candidate_agreement": bool(elliott.get("latest_candidate") and
                        smc["structure_bias"] == elliott["latest_candidate"]["direction"])},
                "orders_submitted": False, "live_trading_enabled": False}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/backtest/walk-forward")
def walk_forward(payload: WalkForwardRequest) -> dict[str, Any]:
    try:
        return run_walk_forward(payload.candles, train_bars=payload.train_bars,
            test_bars=payload.test_bars, step_bars=payload.step_bars,
            warmup_bars=payload.warmup_bars, reward_risk=payload.reward_risk,
            fee_rate=payload.fee_rate, slippage_rate=payload.slippage_rate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/risk/approval")
def risk_approval(payload: RiskApprovalRequest,
                  authorization: str | None = Header(default=None)) -> dict[str, Any]:
    # This gate only creates an authenticated draft-review request. Approval never
    # authorizes broker writes; execution must remain separately disabled.
    risk = RiskWorker().check(allocation_pct=payload.allocation_pct,
        daily_loss_pct=payload.daily_loss_pct, drawdown_pct=payload.drawdown_pct,
        leverage=payload.leverage, data_age_seconds=payload.data_age_seconds,
        paper_mode=True, market_open=payload.market_open)
    if not risk["passed"]:
        return {"ok": False, "risk": risk, "approval_created": False,
                "status": "rejected_by_risk", "live_execution_allowed": False}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="authenticated_user_token_required")
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    if not supabase_url or not anon_key:
        raise HTTPException(status_code=503, detail="approval_service_not_configured")
    proposal = payload.proposal
    digest = hashlib.sha256(json.dumps(proposal, sort_keys=True, separators=(",", ":"),
                                      ensure_ascii=False).encode("utf-8")).hexdigest()
    expires_at = (datetime.now(timezone.utc) +
                  timedelta(minutes=payload.expires_in_minutes)).isoformat()
    headers = {"apikey": anon_key, "Authorization": authorization,
               "Content-Type": "application/json"}
    body = {"p_thread_id": payload.thread_id, "p_request_type": "strategy_draft_review",
            "p_proposal": proposal, "p_proposal_hash": digest,
            "p_policy_version": "nova-approval.v1", "p_expires_at": expires_at}
    try:
        response = httpx.post(f"{supabase_url}/rest/v1/rpc/nova_create_approval",
                              headers=headers, json=body, timeout=10.0)
        response.raise_for_status()
        created = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=422, detail="approval_request_rejected_by_policy") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="approval_service_unavailable") from exc
    return {"ok": True, "risk": risk, "approval_created": True,
            "approval": created, "status": "awaiting_human_review",
            "live_execution_allowed": False}



def _require_quant_m2m(authorization: str | None) -> None:
    expected = os.getenv("NOVA_QUANT_M2M_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="quant_m2m_auth_not_configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="machine_authentication_required")
    supplied = authorization[7:].strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="invalid_machine_credentials")


@app.post("/v1/mt5/decision")
def mt5_quant_decision(
    payload: MT5QuantDecisionRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_quant_m2m(authorization)
    if payload.execution_enabled is not False:
        raise HTTPException(status_code=403, detail="execution_must_remain_disabled")
    try:
        return evaluate_mt5_event(payload.event)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        # Avoid returning model internals or credentials in error details.
        raise HTTPException(status_code=503, detail="quant_engine_unavailable") from exc


@app.post("/v1/mt5/risk-gate")
def mt5_risk_gate(
    payload: MT5RiskGateRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_quant_m2m(authorization)
    try:
        return evaluate_mt5_risk(payload.event, payload.quant_engine_result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="risk_gate_unavailable") from exc
