"""Isolated NOVA research runtime. All routes are research/approval-only; no broker orders."""
from __future__ import annotations
import os
from typing import Any
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from workers.feature.smc_wave.smc_strategy import analyze_smc, run_smc_backtest
from workers.feature.elliott_wave.elliott_wave import analyze_elliott_wave
from workers.backtest.walk_forward import run_walk_forward
from workers.risk.manager_prototype import RiskWorker
from integrations.notifications.approval_guard import ApprovalGuard

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
    if os.getenv("NOVA_APPROVALS_ENABLED", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="approval_workflow_disabled")
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
    access_token = authorization[7:].strip()
    if not access_token:
        raise HTTPException(status_code=401, detail="authenticated_user_token_required")
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    publishable_key = (os.getenv("SUPABASE_PUBLISHABLE_KEY", "") or
                       os.getenv("SUPABASE_ANON_KEY", ""))
    if not supabase_url or not publishable_key:
        raise HTTPException(status_code=503, detail="approval_service_not_configured")
    try:
        guard = ApprovalGuard(supabase_url=supabase_url,
                              publishable_key=publishable_key,
                              policy_version="nova-approval.v1")
        created = guard.create(thread_id=payload.thread_id, proposal=payload.proposal,
                               access_token=access_token,
                               expires_in_minutes=payload.expires_in_minutes)
    except ValueError:
        raise HTTPException(status_code=422, detail="approval_request_rejected_by_policy") from None
    except (RuntimeError, PermissionError):
        raise HTTPException(status_code=503, detail="approval_service_unavailable") from None
    return {"ok": True, "risk": risk, "approval_created": True,
            "approval": created, "status": "awaiting_human_review",
            "live_execution_allowed": False}
