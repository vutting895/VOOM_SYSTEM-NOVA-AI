from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from workers import runtime

app = runtime.app
client = TestClient(app)


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


def sample_candles():
    closes = [10, 9, 8, 9, 11, 10, 9, 12, 13, 11, 10, 14, 15, 13, 12, 16]
    rows = []
    for i, close in enumerate(closes):
        open_price = close - 0.3 if i % 2 else close + 0.3
        rows.append({
            "open": open_price,
            "high": max(open_price, close) + 0.5,
            "low": min(open_price, close) - 0.5,
            "close": close,
        })
    return rows


def test_health_is_research_only():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["orders_enabled"] is False
    assert body["live_trading_enabled"] is False


def test_smc_analyze_endpoint_returns_structure():
    response = client.post("/v1/smc/analyze", json={"candles": sample_candles()}, headers={"Authorization": "Bearer test-user-token"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["strategy"] == "SMC"
    assert body["orders_submitted"] is False


def test_smc_backtest_endpoint_returns_research_metrics():
    response = client.post("/v1/smc/backtest", json={"candles": sample_candles()}, headers={"Authorization": "Bearer test-user-token"})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "research_backtest_only"
    assert body["trade_count"] == len(body["trades"])
    assert body["live_trading_enabled"] is False


def test_smc_analyze_rejects_invalid_ohlc():
    bars = sample_candles()
    bars[0]["high"] = bars[0]["low"] - 1
    response = client.post("/v1/smc/analyze", json={"candles": bars}, headers={"Authorization": "Bearer test-user-token"})
    assert response.status_code == 422
