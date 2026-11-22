from __future__ import annotations
import json
from pathlib import Path
import pytest
import httpx
from fastapi.testclient import TestClient
from workers import runtime

app = runtime.app


class StubSupabaseAuthClient:
    def __init__(self, *, timeout, follow_redirects):
        assert timeout == 5.0
        assert follow_redirects is False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, *, headers):
        assert url == "https://nova-test.supabase.co/auth/v1/user"
        assert headers["Authorization"] == "Bearer test-user-token"
        return httpx.Response(200, json={"id": "test-user-123"})


@pytest.fixture(autouse=True)
def verified_supabase_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://nova-test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    monkeypatch.setattr(runtime.httpx, "AsyncClient", StubSupabaseAuthClient)

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
    response = client.post("/v1/research/pipeline", json={"candles": BARS}, headers={"Authorization": "Bearer test-user-token"})
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
    }, headers={"Authorization": "Bearer test-user-token"})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "walk_forward_out_of_sample_research_only"
    assert body["fold_count"] >= 1
    assert body["oos_trade_count"] == sum(f["oos_trade_count"] for f in body["folds"])
    assert body["live_trading_enabled"] is False


def test_risk_rejection_never_creates_approval():
    client = TestClient(app)
    response = client.post("/v1/risk/approval", json={
        "thread_id": "00000000-0000-0000-0000-000000000001",
        "proposal": {"title": "Draft", "summary": "Research only", "market": "BTC/USDT",
                     "timeframe": "1h", "riskProfile": "low"},
        "allocation_pct": 30, "daily_loss_pct": 0, "drawdown_pct": 0
    }, headers={"Authorization": "Bearer test-user-token"})
    assert response.status_code == 200
    assert response.json()["status"] == "rejected_by_risk"
    assert response.json()["approval_created"] is False


def test_risk_pass_requires_authenticated_approval_context():
    client = TestClient(app)
    response = client.post("/v1/risk/approval", json={
        "thread_id": "00000000-0000-0000-0000-000000000001",
        "proposal": {"title": "Draft", "summary": "Research only", "market": "BTC/USDT",
                     "timeframe": "1h", "riskProfile": "low"},
        "allocation_pct": 10, "daily_loss_pct": 0, "drawdown_pct": 0
    })
    assert response.status_code == 401
