from datetime import datetime, timedelta, timezone

from nova_engine.data.csv_ingest import aggregate_bars, load_csv
from nova_engine.domain.contracts import Candle, Timeframe


def _candle(minute: int, close: float = 2000.0) -> Candle:
    return Candle("XAUUSD", Timeframe.M1,
                  datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=minute),
                  close, close + 1, close - 1, close, 10)


def test_load_csv_rejects_duplicate_and_naive_timestamp(tmp_path):
    p = tmp_path / "bars.csv"
    p.write_text(
        "timestamp,open,high,low,close,tick_volume\n"
        "2026-01-01T00:00:00Z,2000,2001,1999,2000,10\n"
        "2026-01-01T00:00:00Z,2000,2001,1999,2000,10\n"
        "2026-01-01T00:01:00,2000,2001,1999,2000,10\n",
        encoding="utf-8",
    )
    bars, report = load_csv(p)
    assert len(bars) == 1
    assert report.duplicate_timestamps == 1
    assert report.rejected_rows == 2


def test_aggregate_only_complete_m5_buckets():
    bars = [_candle(i, 2000 + i) for i in range(5)]
    result = aggregate_bars(bars, "M5")
    assert len(result) == 1
    assert result[0].open == 2000
    assert result[0].close == 2004
    assert result[0].high == 2005
    assert result[0].low == 1999
    assert result[0].tick_volume == 50


def test_aggregate_drops_incomplete_bucket():
    result = aggregate_bars([_candle(i) for i in range(4)], "M5")
    assert result == []
