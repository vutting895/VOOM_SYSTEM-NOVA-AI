"""Background SMC + Elliott analysis tasks.

Run from this directory with:
    celery -A tasks worker --loglevel=info --queues=smc_analysis
"""

from __future__ import annotations
import hashlib
import logging
import re
from typing import Any
from celery.exceptions import SoftTimeLimitExceeded
from redis.exceptions import RedisError
from bot_state import bot_is_active, cache_analysis, cache_latest_price
from celery_app import celery_app
from smc_engine import analyze_market

logger = logging.getLogger(__name__)
_SYMBOL_RE = re.compile(r"^[A-Za-z0-9._/-]{2,32}$")
_TIMEFRAME_RE = re.compile(r"^(1m|5m|15m|30m|1h|4h|1d|1w)$", re.IGNORECASE)


@celery_app.task(bind=True, name="tasks.scan_market_smc", max_retries=3, acks_late=True)
def scan_market_smc(self, symbol: str, timeframe: str, bars: list[dict[str, Any]], *,
                    last_bar_closed: bool, tenant_id: str | None = None,
                    bot_id: str | None = None, source_metadata: dict[str, str] | None = None,
                    lookback: int = 20, pivot_left_bars: int = 2,
                    pivot_right_bars: int = 2) -> dict[str, Any]:
    """Analyze an authorized, closed OHLC snapshot; never accept credentials."""
    symbol = str(symbol).strip().upper()
    timeframe = str(timeframe).strip().lower()
    if not _SYMBOL_RE.fullmatch(symbol):
        raise ValueError("Invalid symbol")
    if not _TIMEFRAME_RE.fullmatch(timeframe):
        raise ValueError("Unsupported timeframe")
    if last_bar_closed is not True:
        raise ValueError("The final OHLC record must be a confirmed closed candle")
    if bot_id and not tenant_id:
        raise ValueError("bot_id requires tenant_id")
    if source_metadata is not None:
        allowed = {"provider", "connection_id", "fetched_at", "source_as_of"}
        if not isinstance(source_metadata, dict) or set(source_metadata) - allowed:
            raise ValueError("Invalid market data source metadata")

    task_id = getattr(self.request, "id", None)
    logger.info("NOVA scan started task_id=%s symbol=%s timeframe=%s", task_id, symbol, timeframe)
    try:
        if tenant_id and bot_id and not bot_is_active(tenant_id, bot_id):
            return {"task_id": task_id, "symbol": symbol, "timeframe": timeframe,
                    "status": "SKIPPED", "reason": "BOT_NOT_ACTIVE",
                    "orders_enabled": False, "execution_enabled": False,
                    "live_trading_enabled": False}

        result = analyze_market(bars, lookback=lookback,
                                pivot_left_bars=pivot_left_bars,
                                pivot_right_bars=pivot_right_bars)
        result.update({"task_id": task_id, "symbol": symbol, "timeframe": timeframe})
        result["status"] = "COMPLETED"
        if source_metadata:
            result["market_data_source"] = dict(source_metadata)

        # Tenant is mandatory for System Hub dispatch; bot_id is optional for
        # one-shot research scans. A bot-bound scan still requires ACTIVE state.
        scope = f"{tenant_id or 'public'}:{bot_id or 'research'}"
        identity = f"{scope}:{symbol}:{timeframe}:{result['last_bar_timestamp']}"
        cache_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        cache_analysis(cache_key, result, ttl_seconds=300)
        if tenant_id:
            cache_latest_price(tenant_id, symbol, {
                "symbol": symbol,
                "timeframe": timeframe,
                "price": bars[-1]["close"],
                "as_of": result["last_bar_timestamp"],
                "source": source_metadata or {"provider": "unspecified"},
            }, ttl_seconds=15)
        logger.info("NOVA scan completed task_id=%s fvg=%s sweeps=%s elliott=%s", task_id,
                    result["summary"]["fvg_count"], result["summary"]["liquidity_sweep_count"],
                    result["summary"]["elliott_pattern_count"])
        return result
    except (SoftTimeLimitExceeded, RedisError) as exc:
        logger.exception("Transient runtime failure task_id=%s", task_id)
        raise self.retry(exc=exc, countdown=5 * (self.request.retries + 1))


# Export app explicitly so the requested CLI command "celery -A tasks worker" works.
app = celery_app
