"""Background SMC + Elliott analysis tasks.

Run from this directory with:
    celery -A tasks worker --loglevel=info --queues=smc_analysis
"""

from __future__ import annotations
import logging
import re
from typing import Any
from celery.exceptions import SoftTimeLimitExceeded
from redis.exceptions import RedisError
from bot_state import bot_is_active, cache_analysis, set_worker_heartbeat
from celery_app import celery_app
from smc_engine import analyze_market

logger = logging.getLogger(__name__)
_SYMBOL_RE = re.compile(r"^[A-Za-z0-9._/-]{2,32}$")
_TIMEFRAME_RE = re.compile(r"^(1m|5m|15m|30m|1h|4h|1d|1w)$", re.IGNORECASE)


@celery_app.task(bind=True, name="tasks.scan_market_smc", max_retries=3, acks_late=True)
def scan_market_smc(self, symbol: str, timeframe: str, bars: list[dict[str, Any]], *,
                    tenant_id: str | None = None, bot_id: str | None = None,
                    lookback: int = 20, pivot_left_bars: int = 2,
                    pivot_right_bars: int = 2) -> dict[str, Any]:
    """Analyze an authorized OHLC snapshot; never accept broker/provider credentials."""
    symbol = str(symbol).strip().upper()
    timeframe = str(timeframe).strip().lower()
    if not _SYMBOL_RE.fullmatch(symbol):
        raise ValueError("Invalid symbol")
    if not _TIMEFRAME_RE.fullmatch(timeframe):
        raise ValueError("Unsupported timeframe")
    if bool(tenant_id) != bool(bot_id):
        raise ValueError("tenant_id and bot_id must be provided together")
    task_id = getattr(self.request, "id", None)
    logger.info("NOVA scan started task_id=%s symbol=%s timeframe=%s", task_id, symbol, timeframe)
    try:
        if tenant_id and bot_id and not bot_is_active(tenant_id, bot_id):
            return {"task_id": task_id, "symbol": symbol, "timeframe": timeframe,
                    "status": "SKIPPED", "reason": "BOT_NOT_ACTIVE",
                    "orders_enabled": False, "live_trading_enabled": False}
        result = analyze_market(bars, lookback=lookback, pivot_left_bars=pivot_left_bars,
                                pivot_right_bars=pivot_right_bars)
        result.update({"task_id": task_id, "symbol": symbol, "timeframe": timeframe})
        result["status"] = "COMPLETED"
        cache_key = re.sub(r"[^A-Za-z0-9:_-]", "_", f"{symbol}:{timeframe}:{result['last_bar_timestamp']}")
        cache_analysis(cache_key, result, ttl_seconds=300)
        set_worker_heartbeat("smc-worker", ttl_seconds=45)
        logger.info("NOVA scan completed task_id=%s fvg=%s sweeps=%s elliott=%s", task_id,
                    result["summary"]["fvg_count"], result["summary"]["liquidity_sweep_count"],
                    result["summary"]["elliott_pattern_count"])
        return result
    except (SoftTimeLimitExceeded, RedisError) as exc:
        logger.exception("Transient runtime failure task_id=%s", task_id)
        raise self.retry(exc=exc, countdown=5 * (self.request.retries + 1))
