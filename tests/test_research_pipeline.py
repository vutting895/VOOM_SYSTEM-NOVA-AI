from __future__ import annotations
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from workers.runtime import app

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "btcusdt_1h_binance_sample.json"
DATA = json.loads(FIXTURE.read_text(encoding="utf-8"))
BARS = DATA["candles"]


def test_fixture_is_real_timestamped_ohlcv_and_chronological():
    assert DATA["source"].startswith("Binance Spot")
    assert len(BARS) >= 100
    timestamps = [row["timestamp"] for row in BARS]
    assert timestamps == sorted(timestamps)
    for row in BARS:
        assert row["low"] <= min(row["open"], row["close"])
        assert row["high"] >= max(row["open"], row["close"])
        assert row["volume"] >= 0


def test_runtime_pipeline_combines_smc_and_elliott():
    client = TestClient(app)
    response = client.post("/v1/research/pipeline", json={"candles": BARS})
    assert response.status_code == 200
    body = response.json()
    assert body["pipeline"] == "smc_elliott_research_v1"
    assert body["smc"]["strategy"] == "SMC"
    assert body["elliott_wave"]["strategy"] == "ElliottWave"
    assert body["orders_submitted"] is False
    assert body["live_trading_enabled"] is False


def test_walk_forward_produces_held_out_folds_only():
    client = TestClient(app)
    response = client.post("/v1/backtest/walk-forward", json={
        "candles": BARS, "train_bars": 60, "test_bars": 30, "step_bars": 30,
        "warmup_bars": 30
    })
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "walk_forward_out_of_sample_research_only"
    assert body["fold_count"] >= 1
    assert body["oos_trade_count"] == sum(f["oos_trade_count"] for f in body["folds"])
    assert body["live_trading_enabled"] is False


def test_risk_rejection_never_creates_approval(monkeypatch):
    monkeypatch.setenv("NOVA_APPROVALS_ENABLED", "true")
    client = TestClient(app)
    response = client.post("/v1/risk/approval", json={
        "thread_id": "00000000-0000-0000-0000-000000000001",
        "proposal": {"title": "Draft", "summary": "Research only", "market": "BTC/USDT",
                     "timeframe": "1h", "riskProfile": "low"},
        "allocation_pct": 30, "daily_loss_pct": 0, "drawdown_pct": 0
    })
    assert response.status_code == 200
    assert response.json()["status"] == "rejected_by_risk"
    assert response.json()["approval_created"] is False


def test_risk_pass_requires_authenticated_approval_context(monkeypatch):
    monkeypatch.setenv("NOVA_APPROVALS_ENABLED", "true")
    client = TestClient(app)
    response = client.post("/v1/risk/approval", json={
        "thread_id": "00000000-0000-0000-0000-000000000001",
        "proposal": {"title": "Draft", "summary": "Research only", "market": "BTC/USDT",
                     "timeframe": "1h", "riskProfile": "low"},
        "allocation_pct": 10, "daily_loss_pct": 0, "drawdown_pct": 0
    })
    assert response.status_code == 401


def test_ea_v182_analysis_route_requires_service_auth_and_fails_closed(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("NOVA_EA_ANALYSIS_TOKEN", raising=False)
    bars = []
    from datetime import datetime, timedelta, timezone
    end = datetime.fromisoformat("2026-11-23T11:00:00+00:00")
    for index in range(110):
        stamp = end - timedelta(minutes=5 * (109 - index))
        bars.append({
            "time": stamp.isoformat(), "open": 100.0, "high": 101.0,
            "low": 99.0, "close": 100.0, "volume": 10
        })
    payload = {
        "market_data": {"symbol": "XAUUSDm", "timeframe": "M5", "bars": bars},
        "current_time": "2026-11-23T12:00:00+00:00",
        "premium_discount": {"zone": "EQUILIBRIUM"},
    }
    assert client.post("/v1/ea/v1.82/analyze", json=payload).status_code == 503

    monkeypatch.setenv("NOVA_EA_ANALYSIS_TOKEN", "test-service-token")
    assert client.post("/v1/ea/v1.82/analyze", json=payload).status_code == 401
    assert client.post("/v1/ea/v1.82/analyze", json=payload,
                       headers={"Authorization": "Bearer wrong"}).status_code == 401

    response = client.post("/v1/ea/v1.82/analyze", json=payload,
                           headers={"Authorization": "Bearer test-service-token"})
    assert response.status_code == 200
    body = response.json()
    assert body["final_decision"] == "NO_TRADE"
    assert "STALE_MARKET_DATA" in body["final_decision_blockers"]
    assert body["orders_submitted"] is False
    assert body["execution_enabled"] is False
    assert body["live_trading_enabled"] is False
