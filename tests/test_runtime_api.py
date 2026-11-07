from __future__ import annotations

from fastapi.testclient import TestClient

from workers.runtime import app

client = TestClient(app)


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
    response = client.post("/v1/smc/analyze", json={"candles": sample_candles()})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["strategy"] == "SMC"
    assert body["orders_submitted"] is False


def test_smc_backtest_endpoint_returns_research_metrics():
    response = client.post("/v1/smc/backtest", json={"candles": sample_candles()})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "research_backtest_only"
    assert body["trade_count"] == len(body["trades"])
    assert body["live_trading_enabled"] is False


def test_smc_analyze_rejects_invalid_ohlc():
    bars = sample_candles()
    bars[0]["high"] = bars[0]["low"] - 1
    response = client.post("/v1/smc/analyze", json={"candles": bars})
    assert response.status_code == 422
