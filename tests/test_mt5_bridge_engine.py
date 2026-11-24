from __future__ import annotations

import importlib.util
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace

import pytest

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "integrations"
    / "mt5-readonly-bridge"
    / "mt5_bridge_engine.py"
)
SPEC = importlib.util.spec_from_file_location("nova_mt5_bridge_engine", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
MT5BridgeEngine = MODULE.MT5BridgeEngine
MT5PolicyViolation = MODULE.MT5PolicyViolation


class FakeMT5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    POSITION_TYPE_BUY = 0
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1

    def __init__(self, *, equity=1000.0, pnl=-33.0, trade_mode=0, server="Exness-MT5Trial"):
        self.account = SimpleNamespace(
            login=123456, trade_mode=trade_mode, server=server,
            balance=equity, equity=equity, profit=0.0, margin=0.0,
            margin_free=equity, margin_level=0.0, leverage=100,
            currency="USD", company="Exness",
        )
        self.terminal = SimpleNamespace(connected=True, company="Exness")
        self.pnl = pnl
        self.positions = ()
        self.orders = ()
        self.initialized = 0
        self.shutdown_called = False

    def initialize(self, **kwargs):
        self.initialized += 1
        return True

    def terminal_info(self):
        return self.terminal

    def account_info(self):
        return self.account

    def last_error(self):
        return (0, "ok")

    def symbol_info(self, symbol):
        return SimpleNamespace(
            point=0.00001, trade_tick_size=0.00001, digits=5, volume_step=0.01,
            volume_min=0.01, volume_max=100.0,
        )

    def symbol_select(self, symbol, enable):
        return True

    def order_calc_profit(self, order_type, symbol, volume, entry, stop):
        return self.pnl * volume

    def positions_get(self, **kwargs):
        return self.positions

    def orders_get(self, **kwargs):
        return self.orders

    def shutdown(self):
        self.shutdown_called = True


def engine(api, **identity):
    return MT5BridgeEngine(
        api=api,
        expected_login=identity.get("expected_login", 123456),
        expected_server=identity.get("expected_server", "Exness-MT5Trial"),
        reconnect_attempts=1,
        reconnect_delay_seconds=0,
    )


def test_health_and_account_are_demo_read_only():
    api = FakeMT5()
    bridge = engine(api)
    health = bridge.get_server_health()
    account = bridge.get_account_summary()
    assert health["status"] == "ok"
    assert health["execution_enabled"] is False
    assert account["trade_mode"] == "demo"
    assert account["equity_decimal"] == "1000.0"
    assert account["execution_enabled"] is False


def test_rejects_missing_provisioned_account_identity():
    with pytest.raises(MT5PolicyViolation):
        MT5BridgeEngine(api=FakeMT5())


def test_rejects_wrong_provisioned_login():
    api = FakeMT5()
    api.account.login = 654321
    with pytest.raises(MT5PolicyViolation):
        engine(api).initialize()


def test_rejects_wrong_provisioned_server():
    with pytest.raises(MT5PolicyViolation):
        engine(FakeMT5(server="Exness-MT5Real")).initialize()


def test_rejects_account_switch_after_initial_connection():
    api = FakeMT5()
    bridge = engine(api)
    assert bridge.initialize()
    api.account.login = 654321
    with pytest.raises(MT5PolicyViolation):
        bridge.ensure_connection()


def test_rejects_non_demo_account():
    with pytest.raises(MT5PolicyViolation):
        engine(FakeMT5(trade_mode=1)).initialize()


def test_lot_size_floors_to_broker_step_and_stays_within_one_percent():
    result = engine(FakeMT5(equity=1000.0, pnl=-33.0)).calculate_lot_size(
        "EURUSD", "BUY", 1.10, 1.09
    )
    assert result["volume_decimal"] == "0.30"
    assert Decimal(result["estimated_stop_loss_account_currency"]) == Decimal("9.90")
    assert result["risk_budget_account_currency"] == "10.00"
    assert result["execution_authorized"] is False


def test_rejects_non_policy_risk_percentage():
    with pytest.raises(MT5PolicyViolation):
        engine(FakeMT5()).calculate_lot_size(
            "EURUSD", "BUY", 1.10, 1.09, risk_percent=5.0
        )


def test_rejects_size_below_broker_minimum():
    with pytest.raises(MT5PolicyViolation):
        engine(FakeMT5(equity=1000.0, pnl=-2000.0)).calculate_lot_size(
            "EURUSD", "BUY", 1.10, 1.09
        )


def test_sl_tp_are_advisory_and_side_aware():
    bridge = engine(FakeMT5())
    buy = bridge.calculate_sl_tp_prices("EURUSD", "BUY", 1.10, 100, 200)
    sell = bridge.calculate_sl_tp_prices("EURUSD", "SELL", 1.10, 100, 200)
    assert buy == {"entry": 1.1, "sl": 1.099, "tp": 1.102}
    assert sell == {"entry": 1.1, "sl": 1.101, "tp": 1.098}


def test_order_submission_and_position_close_are_fail_closed():
    api = FakeMT5()
    bridge = engine(api)
    assert bridge.submit_market_order(symbol="EURUSD")["code"] == "BROKER_WRITES_DISABLED"
    assert bridge.submit_pending_order(symbol="EURUSD")["code"] == "BROKER_WRITES_DISABLED"
    assert bridge.close_position(ticket=1)["code"] == "BROKER_WRITES_DISABLED"
    assert not hasattr(api, "order_send")


def test_positions_snapshot_fails_closed_instead_of_silently_truncating():
    api = FakeMT5()
    api.positions = tuple(object() for _ in range(MODULE.MAX_POSITIONS + 1))
    with pytest.raises(MODULE.MT5BridgeUnavailable, match="truncated snapshot"):
        engine(api).get_open_positions()


def test_pending_order_snapshot_fails_closed_instead_of_silently_truncating():
    api = FakeMT5()
    api.orders = tuple(object() for _ in range(MODULE.MAX_PENDING_ORDERS + 1))
    with pytest.raises(MODULE.MT5BridgeUnavailable, match="truncated snapshot"):
        engine(api).get_pending_orders()


def test_positions_and_pending_orders_are_read_only_snapshots():
    bridge = engine(FakeMT5())
    assert bridge.get_open_positions() == []
    assert bridge.get_pending_orders() == []



def test_sl_tp_rejects_entry_not_aligned_to_trade_tick():
    bridge = engine(FakeMT5())
    with pytest.raises(ValueError):
        bridge.calculate_sl_tp_prices("EURUSD", "BUY", 1.100001, 100, 200)


def test_lot_size_rejects_stop_not_aligned_to_trade_tick():
    bridge = engine(FakeMT5())
    with pytest.raises(ValueError):
        bridge.calculate_lot_size("EURUSD", "BUY", 1.10, 1.090001)
