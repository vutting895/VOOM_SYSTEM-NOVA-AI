"""Small HTTP runtime for isolated research/backtest worker containers."""
from __future__ import annotations
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any
from workers.feature.smc_wave.smc_strategy import analyze_smc, run_smc_backtest

app = FastAPI(title="VOOM NOVA Research Worker", version="0.2.0")

class BacktestRequest(BaseModel):
    candles: list[dict[str, Any]] = Field(min_length=10)
    reward_risk: float = Field(default=2.0, ge=0.5, le=5.0)
    fee_rate: float = Field(default=0.001, ge=0, lt=0.05)
    slippage_rate: float = Field(default=0.0005, ge=0, lt=0.05)
    initial_equity: float = Field(default=10000.0, gt=0)

@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "research-worker", "orders_enabled": False, "live_trading_enabled": False}

@app.post("/v1/smc/analyze")
def smc_analyze(payload: BacktestRequest) -> dict[str, Any]:
    try:
        result = analyze_smc(payload.candles, include_full_history=True)
        return result
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
