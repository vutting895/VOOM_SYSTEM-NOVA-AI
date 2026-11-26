"""Disabled-by-default policy scaffold for an isolated Exness MT5 Demo adapter.

No MetaTrader5 import, network listener, or broker mutation function exists here.
The only executable path is signed-command verification and preflight reporting.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

TRADING_FLAGS = {
    "ordersEnabled": False,
    "executionEnabled": False,
    "liveTradingEnabled": False,
}


class PolicyRejected(RuntimeError):
    """A command failed a mandatory Demo policy check."""


class ExecutionDisabled(PolicyRejected):
    """Broker dispatch is intentionally unavailable in this release scope."""


@dataclass(frozen=True)
class DemoIdentity:
    login: int
    server: str
    company: str
    currency: str
    trade_mode: int


@dataclass(frozen=True)
class OrderIntent:
    command_id: str
    symbol: str
    side: str
    volume: Decimal
    stop_loss: Decimal
    take_profit: Decimal
    expires_at: int
    policy_version: str
    payload_hash: str


def _get(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, (bool, float)):
        raise PolicyRejected(f"{field} must be a decimal string or Decimal; binary floats are forbidden")
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        raise PolicyRejected(f"{field} is not a valid decimal") from None
    if not parsed.is_finite() or parsed <= 0:
        raise PolicyRejected(f"{field} must be finite and positive")
    return parsed


def verify_demo_identity(account: Any, terminal: Any, mt5_constants: Any,
                         expected_login: int, expected_server: str) -> DemoIdentity:
    """Verify account mode, Exness identity and pinned account identity."""
    if account is None or terminal is None or mt5_constants is None:
        raise PolicyRejected("MT5 account, terminal and constants are required")
    demo_mode = _get(mt5_constants, "ACCOUNT_TRADE_MODE_DEMO")
    trade_mode = _get(account, "trade_mode")
    login = _get(account, "login")
    server = str(_get(account, "server", "")).strip()
    company = str(_get(terminal, "company", "")).strip()
    currency = str(_get(account, "currency", "")).strip().upper()
    if demo_mode is None or trade_mode != demo_mode:
        raise PolicyRejected("only a verified MT5 Demo account is permitted")
    if "exness" not in f"{server} {company}".casefold():
        raise PolicyRejected("broker identity is not on the Exness allowlist")
    if type(login) is not int or login != expected_login:
        raise PolicyRejected("account login does not match the provisioned identity")
    if not expected_server or server.casefold() != expected_server.casefold():
        raise PolicyRejected("MT5 server does not match the provisioned identity")
    if _get(terminal, "connected") is not True:
        raise PolicyRejected("MT5 terminal is not connected")
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise PolicyRejected("broker account currency is missing or invalid")
    return DemoIdentity(login, server, company, currency, trade_mode)


def validate_order_intent(payload: dict[str, Any], now: int | None = None) -> OrderIntent:
    """Validate a narrow intent; validation never submits or authorizes a broker write."""
    required = {
        "command_id", "symbol", "side", "volume", "stop_loss", "take_profit",
        "expires_at", "policy_version", "payload_hash",
    }
    if not isinstance(payload, dict) or set(payload) != required:
        raise PolicyRejected("intent fields do not match the strict schema")
    command_id = payload["command_id"]
    symbol = payload["symbol"]
    side = payload["side"]
    if not isinstance(command_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", command_id):
        raise PolicyRejected("invalid command ID")
    if not isinstance(symbol, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", symbol):
        raise PolicyRejected("invalid symbol")
    if side not in {"buy", "sell"}:
        raise PolicyRejected("side must be buy or sell")
    volume = _decimal(payload["volume"], "volume")
    stop_loss = _decimal(payload["stop_loss"], "stop_loss")
    take_profit = _decimal(payload["take_profit"], "take_profit")
    expiry = payload["expires_at"]
    current = int(time.time()) if now is None else int(now)
    if type(expiry) is not int or expiry <= current or expiry > current + 60:
        raise PolicyRejected("command is expired or exceeds the 60-second lifetime")
    policy_version = payload["policy_version"]
    if not isinstance(policy_version, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", policy_version):
        raise PolicyRejected("invalid policy version")
    canonical = {key: payload[key] for key in sorted(payload) if key != "payload_hash"}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()).hexdigest()
    supplied_hash = payload["payload_hash"]
    if not isinstance(supplied_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", supplied_hash) or supplied_hash != digest:
        raise PolicyRejected("intent payload hash mismatch")
    return OrderIntent(command_id, symbol, side, volume, stop_loss, take_profit, expiry, policy_version, digest)


def preflight_demo_order(*, signed_message: dict[str, Any], secret: bytes,
                         expected_tenant_id: str, expected_connection_id: str,
                         expected_login: int, expected_server: str,
                         account: Any, terminal: Any, mt5_constants: Any,
                         replay_guard: Any, now: int | None = None) -> dict[str, Any]:
    """Verify identity, signature and replay state, then return non-dispatching preflight."""
    from command_contract import verify_signed_command

    intent, nonce = verify_signed_command(
        signed_message,
        secret=secret,
        expected_tenant_id=expected_tenant_id,
        expected_connection_id=expected_connection_id,
        expected_login=expected_login,
        expected_server=expected_server,
        now=now,
    )
    identity = verify_demo_identity(account, terminal, mt5_constants, expected_login, expected_server)
    replay_guard.consume(nonce, intent.command_id, now=now)
    return {
        "state": "preflight_only",
        "validated": True,
        "riskDecision": "not_evaluated",
        "dispatchAllowed": False,
        "reason": "execution_disabled",
        "intent": {
            "commandId": intent.command_id,
            "symbol": intent.symbol,
            "side": intent.side,
            "volume": str(intent.volume),
            "policyVersion": intent.policy_version,
        },
        "account": {"loginVerified": True, "serverVerified": True, "environment": "demo", "currency": identity.currency},
        **TRADING_FLAGS,
    }


def dispatch_demo_order(*_args: Any, **_kwargs: Any) -> None:
    """Permanent deny stub for this Work Order; there is no broker dispatch path."""
    raise ExecutionDisabled("broker dispatch is not implemented or authorized")
