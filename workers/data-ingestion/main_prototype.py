"""Allow-listed public Binance candle ingestion; no credentials or order actions."""
from __future__ import annotations
import json, os, urllib.parse, urllib.request
from datetime import datetime, timezone

BASE_URL = "https://api.binance.com/api/v3/klines"
ALLOWED_INTERVALS = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}


def _utc_iso(milliseconds: int) -> str:
    return datetime.fromtimestamp(milliseconds / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_ohlcv(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 500) -> list[dict]:
    """Fetch public candles while preserving provider decimal strings."""
    symbol = symbol.upper()
    if not symbol.isalnum() or not 1 <= len(symbol) <= 20:
        raise ValueError("Invalid symbol")
    if interval not in ALLOWED_INTERVALS:
        raise ValueError("Unsupported interval")
    if not 1 <= limit <= 1000:
        raise ValueError("limit must be 1..1000")
    query = urllib.parse.urlencode({"symbol": symbol, "interval": interval, "limit": limit})
    req = urllib.request.Request(BASE_URL + "?" + query, headers={"User-Agent": "VOOM_SYSTEM-NOVA/1.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("Market data provider returned an unexpected payload")
    result = []
    for row in payload:
        if not isinstance(row, list) or len(row) < 7:
            raise RuntimeError("Malformed candle returned by provider")
        result.append({
            "bar_time": _utc_iso(int(row[0])),
            "timestamp": _utc_iso(int(row[0])),
            "close_time": _utc_iso(int(row[6])),
            "open": str(row[1]),
            "high": str(row[2]),
            "low": str(row[3]),
            "close": str(row[4]),
            "volume": str(row[5]),
            "source": "binance_public",
            "symbol": symbol,
            "timeframe": interval,
            "is_closed": int(row[6]) < int(datetime.now(timezone.utc).timestamp() * 1000),
        })
    return result


def main():
    symbol = os.getenv("NOVA_MARKET_SYMBOL", "BTCUSDT")
    interval = os.getenv("NOVA_MARKET_INTERVAL", "1h")
    candles = fetch_ohlcv(symbol, interval, 100)
    persist = os.getenv("NOVA_PERSIST_TO_SUPABASE", "").strip().lower() in {"1", "true", "yes"}
    submitted = 0
    persistence_status = "disabled"
    if persist:
        from supabase_store import SupabaseStore
        store = SupabaseStore.from_env()
        submitted = store.upsert_candles(
            candles,
            symbol=symbol,
            timeframe=interval,
            source="binance_public",
            environment="public",
        )
        store.record_ingestion_run(
            source="binance_public",
            environment="public",
            symbol=symbol,
            timeframe=interval,
            status="completed",
            owner_id=None,
            received_count=len(candles),
            submitted_count=submitted,
        )
        persistence_status = "persisted"
    print(json.dumps({
        "status": "ok",
        "symbol": symbol,
        "interval": interval,
        "count": len(candles),
        "latest": candles[-1] if candles else None,
        "persistence": persistence_status,
        "submitted_count": submitted,
        "orders_enabled": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
