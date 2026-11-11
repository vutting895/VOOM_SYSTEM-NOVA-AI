from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from workers.runtime import app


client = TestClient(app)


def bars(timeframe_seconds: int, as_of: datetime) -> list[dict]:
    start = as_of - timedelta(seconds=timeframe_seconds * 10)
    result = []
    for index in range(10):
        open_price = 2300 + index
        close_price = open_price + 0.5
        result.append({
            "timestamp": (start + timedelta(seconds=timeframe_seconds * index)).isoformat().replace("+00:00", "Z"),
            "open": open_price,
            "high": close_price + 0.5,
            "low": open_price - 0.5,
            "close": close_price,
        })
    return result


def sample_payload() -> dict:
    as_of = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)
    return {
        "symbol": "XAUUSDm",
        "as_of_utc": as_of.isoformat().replace("+00:00", "Z"),
        "candles_by_timeframe": {
            "D1": bars(86_400, as_of),
            "H4": bars(14_400, as_of),
        },
    }


def sample_result() -> dict:
    return {
        "ok": True,
        "knowledge_id": "NOVA-MTF-001",
        "market_state": "UNCLASSIFIED",
        "decision": "RESEARCH_ONLY",
        "signal": None,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }


def test_mtf_endpoint_returns_research_only_context():
    with patch("workers.runtime.analyze_multi_timeframe", return_value=sample_result()) as analyzer:
        response = client.post("/v1/mtf/analyze", json=sample_payload())

    assert response.status_code == 200
    assert response.json()["decision"] == "RESEARCH_ONLY"
    assert response.json()["signal"] is None
    assert response.json()["orders_submitted"] is False
    analyzer.assert_called_once()


def test_mtf_endpoint_maps_invalid_market_data_to_422():
    with patch("workers.runtime.analyze_multi_timeframe", side_effect=ValueError("invalid MTF input")):
        response = client.post("/v1/mtf/analyze", json=sample_payload())

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid MTF input"


def test_mtf_endpoint_requires_symbol_as_of_and_timeframe_data():
    response = client.post("/v1/mtf/analyze", json={"symbol": "XAUUSDm"})
    assert response.status_code == 422
