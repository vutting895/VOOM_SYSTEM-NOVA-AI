"""Keep MT5 bridge timeframe support aligned with the relay allowlist."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "integrations/mt5-readonly-bridge/bridge.py").read_text(encoding="utf-8")
RELAY = (ROOT / "integrations/mt5-bridge-relay/worker.js").read_text(encoding="utf-8")
CLIENT = (ROOT / "integrations/mt5-readonly-bridge/bridge_relay_client.py").read_text(encoding="utf-8")

TIMEFRAMES = {
    "M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20",
    "M30", "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1",
}


def test_bridge_maps_every_advertised_mt5_timeframe():
    duration_block = SOURCE.split("def timeframe_duration_seconds", 1)[1].split(
        "def timeframe_close_time", 1
    )[0]
    value_block = SOURCE.split("def timeframe_value", 1)[1].split("@app.get", 1)[0]
    for timeframe in TIMEFRAMES - {"MN1"}:
        assert f'"{timeframe}"' in duration_block
    for timeframe in TIMEFRAMES:
        assert f'"{timeframe}": mt5.TIMEFRAME_{timeframe}' in value_block


def test_relay_and_python_client_share_the_same_timeframe_contract():
    for timeframe in TIMEFRAMES:
        assert f'"{timeframe}"' in RELAY
        assert f'"{timeframe}"' in CLIENT


def test_monthly_bar_close_uses_calendar_month_not_fixed_seconds():
    assert 'if normalized == "MN1"' in SOURCE
    assert 'opened.replace(month=opened.month + 1, day=1)' in SOURCE
