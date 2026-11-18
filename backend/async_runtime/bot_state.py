"""Redis-backed runtime state and short-lived market cache for NOVA.

PostgreSQL remains the durable source of truth. This module only maintains the
fast runtime projection and cache; it is not a trading authorization system.
"""

from __future__ import annotations
import json
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
import redis

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_-]{0,95}$")
_TRANSITION_SCRIPT = r"""
local current = redis.call('HGET', KEYS[1], 'status') or 'STOPPED'
local target = ARGV[1]
local allowed = {
  ['STOPPED:ACTIVE'] = true,
  ['ACTIVE:PAUSED'] = true,
  ['ACTIVE:STOPPING'] = true,
  ['ACTIVE:ERROR'] = true,
  ['PAUSED:ACTIVE'] = true,
  ['PAUSED:STOPPING'] = true,
  ['PAUSED:STOPPED'] = true,
  ['PAUSED:ERROR'] = true,
  ['STOPPING:STOPPED'] = true,
  ['STOPPING:ERROR'] = true,
  ['ERROR:STOPPED'] = true
}
if current ~= target and not allowed[current .. ':' .. target] then
  return {0, current}
end
local revision = redis.call('HINCRBY', KEYS[1], 'revision', 1)
redis.call('HSET', KEYS[1], 'status', target, 'mode', ARGV[2], 'updated_at', ARGV[3], 'revision', revision)
return {1, target, revision}
"""


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    url = os.environ.get("REDIS_STATE_URL", "redis://localhost:6379/1")
    return redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=3, socket_timeout=3)


def _validate_id(value: str, field: str) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ValueError(f"{field} must be 1-96 safe characters")
    return value


def _state_key(tenant_id: str, bot_id: str) -> str:
    tenant = _validate_id(tenant_id, "tenant_id")
    bot = _validate_id(bot_id, "bot_id")
    return f"nova:tenant:{tenant}:bot:{bot}:state"


def set_bot_status(tenant_id: str, bot_id: str, status: str, mode: str = "AUTO", *,
                   client: redis.Redis | None = None) -> dict[str, Any]:
    """Atomically transition a bot's runtime state using Redis Lua."""
    status, mode = str(status).upper(), str(mode).upper()
    if status not in {"ACTIVE", "PAUSED", "STOPPING", "STOPPED", "ERROR"}:
        raise ValueError("Unsupported bot status")
    if mode not in {"AUTO", "MANUAL"}:
        raise ValueError("mode must be AUTO or MANUAL")
    now = datetime.now(timezone.utc).isoformat()
    result = (client or get_redis_client()).eval(
        _TRANSITION_SCRIPT, 1, _state_key(tenant_id, bot_id), status, mode, now
    )
    if int(result[0]) != 1:
        raise ValueError(f"Invalid bot state transition: {result[1]} -> {status}")
    return get_bot_status(tenant_id, bot_id, client=client)


def get_bot_status(tenant_id: str, bot_id: str, *,
                   client: redis.Redis | None = None) -> dict[str, Any]:
    raw = (client or get_redis_client()).hgetall(_state_key(tenant_id, bot_id))
    if not raw:
        return {"status": "STOPPED", "mode": "AUTO", "revision": 0, "updated_at": None}
    return {"status": raw.get("status", "STOPPED"), "mode": raw.get("mode", "AUTO"),
            "revision": int(raw.get("revision", "0")), "updated_at": raw.get("updated_at")}


def bot_is_active(tenant_id: str, bot_id: str, *,
                  client: redis.Redis | None = None) -> bool:
    return get_bot_status(tenant_id, bot_id, client=client)["status"] == "ACTIVE"


def _tenant_market_key(tenant_id: str, symbol: str) -> str:
    tenant = _validate_id(tenant_id, "tenant_id")
    normalized = symbol.strip().upper()
    if not normalized or len(normalized) > 32:
        raise ValueError("Invalid symbol")
    return f"nova:tenant:{tenant}:market:{normalized}:latest"


def set_worker_heartbeat(worker_name: str, ttl_seconds: int = 180, *,
                         client: redis.Redis | None = None) -> None:
    worker = _validate_id(worker_name, "worker_name")
    if ttl_seconds < 30 or ttl_seconds > 600:
        raise ValueError("ttl_seconds must be between 30 and 600")
    (client or get_redis_client()).setex(
        f"nova:worker:{worker}:heartbeat", ttl_seconds,
        datetime.now(timezone.utc).isoformat(),
    )


def cache_latest_price(tenant_id: str, symbol: str, payload: dict[str, Any],
                       ttl_seconds: int = 15, *, client: redis.Redis | None = None) -> None:
    if ttl_seconds < 1 or ttl_seconds > 300:
        raise ValueError("ttl_seconds must be between 1 and 300")
    (client or get_redis_client()).setex(
        _tenant_market_key(tenant_id, symbol), ttl_seconds,
        json.dumps(payload, separators=(",", ":"), allow_nan=False),
    )


def get_latest_price(tenant_id: str, symbol: str, *,
                     client: redis.Redis | None = None) -> dict[str, Any] | None:
    raw = (client or get_redis_client()).get(_tenant_market_key(tenant_id, symbol))
    return json.loads(raw) if raw else None


def cache_analysis(cache_key: str, payload: dict[str, Any], ttl_seconds: int = 300, *,
                   client: redis.Redis | None = None) -> None:
    key = _validate_id(cache_key, "cache_key")
    if ttl_seconds < 1 or ttl_seconds > 3600:
        raise ValueError("ttl_seconds must be between 1 and 3600")
    (client or get_redis_client()).setex(
        f"nova:analysis:{key}", ttl_seconds,
        json.dumps(payload, separators=(",", ":"), allow_nan=False),
    )
