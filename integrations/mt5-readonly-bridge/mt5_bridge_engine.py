"""NOVA MT5 read-only engine.

This module is an advisory/read-only adapter for the tenant-scoped Exness Demo
terminal. It deliberately contains no broker mutation API. Risk sizing uses
MT5's account-currency profit calculator and floors volume to the broker step.
It does not authorize an order or replace the server-side USD risk policy.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from decimal import Decimal, InvalidOperation, ROUND_DOWN
from typing import Any, Optional

try:
    import MetaTrader5 as mt5
except ImportError:  # Allows contract tests and non-terminal hosts to import this module.
    mt5 = None  # type: ignore[assignment]

logger = logging.getLogger("NOVA.MT5ReadOnlyEngine")

DEMO_RISK_PER_TRADE_PERCENT = Decimal("1.0")
MAX_DAILY_LOSS_PERCENT = Decimal("10.0")
EXECUTION_ENABLED = False
MAX_POSITIONS = 100
MAX_PENDING_ORDERS = 100


class MT5BridgeError(RuntimeError):
    """Base error for MT5 bridge failures."""


class MT5BridgeUnavailable(MT5BridgeError):
    """The terminal/account session is unavailable."""


class MT5PolicyViolation(MT5BridgeError):
    """The connected terminal is outside the permitted account boundary."""


class MT5BridgeEngine:
    """Read-only MT5 terminal client for one Exness Demo tenant.

    Credentials are never accepted by this class. It attaches only to the
    already-authenticated terminal session and refuses non-Exness/non-Demo
    accounts. The class can inspect positions and pending orders, calculate
    hypothetical SL/TP and advisory volume, but cannot submit or modify trades.
    """

    execution_enabled = EXECUTION_ENABLED
    risk_per_trade_percent = DEMO_RISK_PER_TRADE_PERCENT
    max_daily_loss_percent = MAX_DAILY_LOSS_PERCENT

    def __init__(
        self,
        path: Optional[str] = None,
        expected_login: Optional[int] = None,
        reconnect_attempts: int = 2,
        reconnect_delay_seconds: float = 1.0,
        api: Any = None,
    ) -> None:
        self.path = path or os.environ.get("MT5_TERMINAL_PATH") or None
        self.expected_login = int(expected_login) if expected_login is not None else None
        self.reconnect_attempts = max(1, min(int(reconnect_attempts), 5))
        self.reconnect_delay_seconds = max(0.0, min(float(reconnect_delay_seconds), 10.0))
        self._api = api if api is not None else mt5
        self._lock = threading.RLock()
        self.is_connected = False

    def _require_api(self) -> Any:
        if self._api is None:
            raise MT5BridgeUnavailable(
                "MetaTrader5 package is unavailable on this host; no terminal call was made."
            )
        return self._api

    def _initialize_once(self) -> bool:
        api = self._require_api()
        initialized = api.initialize(path=self.path) if self.path else api.initialize()
        if not initialized:
            logger.warning("MT5 initialize failed; code=%s", api.last_error()[0])
            self.is_connected = False
            return False

        terminal = api.terminal_info()
        account = api.account_info()
        if terminal is None or account is None:
            self.is_connected = False
            logger.warning("MT5 terminal/account snapshot unavailable after initialize.")
            return False

        self._validate_account(terminal, account)
        self.is_connected = True
        logger.info("Attached to verified Exness Demo MT5 session; execution remains disabled.")
        return True

    def _validate_account(self, terminal: Any, account: Any) -> None:
        api = self._require_api()
        demo_mode = getattr(api, "ACCOUNT_TRADE_MODE_DEMO", 0)
        trade_mode = getattr(account, "trade_mode", None)
        server = str(getattr(account, "server", "") or "")
        company = str(getattr(terminal, "company", "") or "")
        if trade_mode != demo_mode or "exness" not in f"{server} {company}".lower():
            raise MT5PolicyViolation("Only an Exness Demo MT5 account is permitted.")
        login = getattr(account, "login", None)
        if self.expected_login is not None and login != self.expected_login:
            raise MT5PolicyViolation("MT5 account login does not match the configured tenant account.")

    def initialize(self) -> bool:
        """Attach to the existing terminal session and validate Demo identity."""
        with self._lock:
            try:
                return self._initialize_once()
            except MT5PolicyViolation:
                self.is_connected = False
                raise
            except MT5BridgeError:
                self.is_connected = False
                raise
            except Exception as exc:
                self.is_connected = False
                logger.exception("MT5 initialization failed.")
                raise MT5BridgeUnavailable("MT5 initialization failed.") from exc

    def ensure_connection(self) -> bool:
        """Health-check the terminal and perform bounded reconnect attempts."""
        api = self._require_api()
        with self._lock:
            terminal = api.terminal_info()
            account = api.account_info()
            if terminal is not None and account is not None:
                self._validate_account(terminal, account)
                if bool(getattr(terminal, "connected", False)):
                    self.is_connected = True
                    return True

            self.is_connected = False
            for attempt in range(self.reconnect_attempts):
                if attempt and self.reconnect_delay_seconds:
                    time.sleep(self.reconnect_delay_seconds * attempt)
                try:
                    if self._initialize_once():
                        return True
                except MT5PolicyViolation:
                    self.is_connected = False
                    raise
                except Exception:
                    self.is_connected = False
                    logger.exception("MT5 reconnect attempt failed.")
            raise MT5BridgeUnavailable("MT5 terminal is unavailable after bounded reconnect attempts.")

    def get_server_health(self) -> dict[str, Any]:
        self.ensure_connection()
        api = self._require_api()
        terminal = api.terminal_info()
        account = api.account_info()
        return {
            "status": "ok",
            "terminal_connected": bool(getattr(terminal, "connected", False)),
            "account_session_available": account is not None,
            "broker": "Exness",
            "account_mode": "demo",
            "execution_enabled": False,
            "checked_at_epoch": int(time.time()),
        }

    @staticmethod
    def _decimal(value: Any, field: str) -> Decimal:
        try:
            result = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise MT5BridgeError(f"Invalid numeric MT5 field: {field}") from exc
        if not result.is_finite():
            raise MT5BridgeError(f"Non-finite MT5 field: {field}")
        return result

    def get_account_summary(self) -> dict[str, Any]:
        self.ensure_connection()
        account = self._require_api().account_info()
        if account is None:
            raise MT5BridgeUnavailable("MT5 account snapshot is unavailable.")
        return {
            "login": int(account.login),
            "server": str(getattr(account, "server", "")),
            "trade_mode": "demo",
            "leverage": int(getattr(account, "leverage", 0)),
            "balance": float(account.balance),
            "balance_decimal": str(self._decimal(account.balance, "balance")),
            "equity": float(account.equity),
            "equity_decimal": str(self._decimal(account.equity, "equity")),
            "profit": float(getattr(account, "profit", 0.0)),
            "margin": float(getattr(account, "margin", 0.0)),
            "free_margin": float(getattr(account, "margin_free", 0.0)),
            "margin_level": (
                float(account.margin_level) if getattr(account, "margin_level", None) else None
            ),
            "currency": str(getattr(account, "currency", "")),
            "company": str(getattr(account, "company", "")),
            "execution_enabled": False,
        }

    def get_open_positions(self, symbol: Optional[str] = None) -> list[dict[str, Any]]:
        self.ensure_connection()
        api = self._require_api()
        with self._lock:
            positions = api.positions_get(symbol=symbol) if symbol else api.positions_get()
            if positions is None:
                raise MT5BridgeUnavailable("MT5 positions snapshot failed.")
            result = []
            for pos in positions[:MAX_POSITIONS]:
                result.append({
                    "ticket": int(pos.ticket),
                    "symbol": str(pos.symbol),
                    "type": "BUY" if pos.type == api.POSITION_TYPE_BUY else "SELL",
                    "volume": float(pos.volume),
                    "price_open": float(pos.price_open),
                    "sl": float(pos.sl),
                    "tp": float(pos.tp),
                    "profit": float(pos.profit),
                    "swap": float(pos.swap),
                    "commission": float(getattr(pos, "commission", 0.0)),
                    "time": int(pos.time),
                })
            return result

    def get_pending_orders(self, symbol: Optional[str] = None) -> list[dict[str, Any]]:
        """Read pending orders only; this method never creates or changes orders."""
        self.ensure_connection()
        api = self._require_api()
        with self._lock:
            orders = api.orders_get(symbol=symbol) if symbol else api.orders_get()
            if orders is None:
                raise MT5BridgeUnavailable("MT5 pending-order snapshot failed.")
            return [
                {
                    "ticket": int(order.ticket),
                    "symbol": str(order.symbol),
                    "type": int(order.type),
                    "volume_current": float(order.volume_current),
                    "price_open": float(order.price_open),
                    "sl": float(order.sl),
                    "tp": float(order.tp),
                    "time_setup": int(order.time_setup),
                    "state": int(order.state),
                }
                for order in orders[:MAX_PENDING_ORDERS]
            ]

    def calculate_sl_tp_prices(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        sl_points: float,
        tp_points: float = 0.0,
    ) -> dict[str, float]:
        """Calculate hypothetical SL/TP prices; does not modify a broker position."""
        api = self._require_api()
        self.ensure_connection()
        info = api.symbol_info(symbol)
        if info is None or not api.symbol_select(symbol, True):
            raise MT5BridgeError(f"Symbol unavailable: {symbol}")
        side = side.upper()
        if side not in {"BUY", "SELL"} or sl_points <= 0 or tp_points < 0:
            raise ValueError("Side must be BUY/SELL; SL points must be positive and TP non-negative.")
        point = self._decimal(info.point, "point")
        entry = self._decimal(entry_price, "entry_price")
        sl_delta = self._decimal(sl_points, "sl_points") * point
        tp_delta = self._decimal(tp_points, "tp_points") * point
        if side == "BUY":
            sl, tp = entry - sl_delta, (entry + tp_delta if tp_points else Decimal("0"))
        else:
            sl, tp = entry + sl_delta, (entry - tp_delta if tp_points else Decimal("0"))
        digits = int(info.digits)
        quantum = Decimal("1").scaleb(-digits)
        return {
            "entry": float(entry.quantize(quantum)),
            "sl": float(sl.quantize(quantum)),
            "tp": float(tp.quantize(quantum)) if tp_points else 0.0,
        }

    def calculate_lot_size(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        stop_loss_price: float,
        risk_percent: float = 1.0,
    ) -> dict[str, Any]:
        """Return a fail-closed 1%-equity advisory size in account-currency units.

        MT5 order_calc_profit is used for the one-lot stop loss so the broker's
        contract calculation and account currency are respected. Costs not
        represented by MT5's estimate (e.g. commission/slippage/swap) must be
        added by the upstream risk policy. This result never authorizes execution.
        """
        self.ensure_connection()
        api = self._require_api()
        if self._decimal(risk_percent, "risk_percent") != DEMO_RISK_PER_TRADE_PERCENT:
            raise MT5PolicyViolation("Exness Demo risk per trade is fixed at 1% of current equity.")
        side = side.upper()
        if side not in {"BUY", "SELL"}:
            raise ValueError("Side must be BUY or SELL.")
        if (side == "BUY" and stop_loss_price >= entry_price) or (
            side == "SELL" and stop_loss_price <= entry_price
        ):
            raise ValueError("Stop loss must be on the adverse side of the entry price.")

        account = api.account_info()
        info = api.symbol_info(symbol)
        if account is None or info is None or not api.symbol_select(symbol, True):
            raise MT5BridgeUnavailable("Account or symbol metadata is unavailable.")
        equity = self._decimal(account.equity, "equity")
        if equity <= 0:
            raise MT5PolicyViolation("Non-positive equity blocks risk sizing.")
        risk_amount = equity * DEMO_RISK_PER_TRADE_PERCENT / Decimal("100")
        order_type = api.ORDER_TYPE_BUY if side == "BUY" else api.ORDER_TYPE_SELL
        one_lot_pnl = api.order_calc_profit(
            order_type, symbol, 1.0, float(entry_price), float(stop_loss_price)
        )
        if one_lot_pnl is None:
            raise MT5BridgeUnavailable("MT5 stop-loss profit calculation is unavailable.")
        one_lot_loss = -self._decimal(one_lot_pnl, "one_lot_stop_loss_pnl")
        if one_lot_loss <= 0:
            raise MT5PolicyViolation("MT5 did not return a positive stop-loss loss estimate.")

        step = self._decimal(info.volume_step, "volume_step")
        minimum = self._decimal(info.volume_min, "volume_min")
        maximum = self._decimal(info.volume_max, "volume_max")
        if step <= 0 or minimum <= 0 or maximum < minimum:
            raise MT5PolicyViolation("Invalid broker volume constraints.")
        raw_volume = min(maximum, risk_amount / one_lot_loss)
        steps = (raw_volume / step).to_integral_value(rounding=ROUND_DOWN)
        volume = steps * step
        if volume < minimum:
            raise MT5PolicyViolation("Risk budget is below the broker minimum volume; no size is returned.")
        estimated_loss = one_lot_loss * volume
        if estimated_loss > risk_amount:
            raise MT5PolicyViolation("Rounded volume exceeds the 1% risk budget.")

        return {
            "symbol": symbol,
            "side": side,
            "volume": float(volume),
            "volume_decimal": str(volume),
            "risk_percent": "1.0",
            "equity_account_currency": str(equity),
            "risk_budget_account_currency": str(risk_amount),
            "estimated_stop_loss_account_currency": str(estimated_loss),
            "account_currency": str(getattr(account, "currency", "")),
            "sizing_method": "mt5_order_calc_profit_floor_to_volume_step",
            "execution_authorized": False,
            "execution_enabled": False,
            "costs_included": False,
        }

    def submit_market_order(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Explicit fail-closed stub: broker writes are not implemented."""
        return {"status": False, "code": "BROKER_WRITES_DISABLED", "execution_enabled": False}

    def submit_pending_order(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Explicit fail-closed stub: broker writes are not implemented."""
        return {"status": False, "code": "BROKER_WRITES_DISABLED", "execution_enabled": False}

    def close_position(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Explicit fail-closed stub: position mutation is not implemented."""
        return {"status": False, "code": "BROKER_WRITES_DISABLED", "execution_enabled": False}

    def shutdown(self) -> None:
        with self._lock:
            if self._api is not None:
                self._api.shutdown()
            self.is_connected = False
            logger.info("MT5 terminal session detached; no broker action was performed.")
