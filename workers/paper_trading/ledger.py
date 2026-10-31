"""Deterministic, in-memory paper ledger. This module never calls a broker."""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
import re
from typing import Any

MONEY = Decimal("0.00000001")
SYMBOL = re.compile(r"^[A-Z0-9._-]{2,32}$")


class PaperLedgerError(ValueError):
    """Raised when a paper proposal is invalid or cannot be filled safely."""


class PaperLedger:
    """A deliberately isolated long-only cash ledger for research simulation.

    Fills are simulated immediately at an adverse reference-price adjustment.
    The ledger has no broker client, network transport, persistence, or live-order
    capability. A production service must obtain the risk decision itself from
    trusted server-side policy; caller-supplied model output is not authorization.
    """

    def __init__(self, initial_cash: Any = "10000", fee_bps: Any = "7",
                 slippage_bps: Any = "5", max_quote_age_seconds: int = 60,
                 max_order_notional: Any = "2500") -> None:
        self.initial_cash = self._decimal(initial_cash, "initial_cash", positive=True)
        self.fee_bps = self._decimal(fee_bps, "fee_bps", non_negative=True)
        self.slippage_bps = self._decimal(slippage_bps, "slippage_bps", non_negative=True)
        self.max_order_notional = self._decimal(max_order_notional, "max_order_notional", positive=True)
        if self.fee_bps > 1000 or self.slippage_bps > 1000:
            raise PaperLedgerError("cost_assumption_out_of_range")
        if isinstance(max_quote_age_seconds, bool) or not isinstance(max_quote_age_seconds, int) or max_quote_age_seconds < 1:
            raise PaperLedgerError("max_quote_age_seconds_invalid")
        self.max_quote_age_seconds = max_quote_age_seconds
        self.cash = self.initial_cash
        self.positions: dict[str, dict[str, Decimal]] = {}
        self.events: list[dict[str, Any]] = []
        self._idempotency: dict[str, tuple[str, dict[str, Any]]] = {}
        self._proposals: dict[str, tuple[str, dict[str, Any]]] = {}

    @staticmethod
    def _decimal(value: Any, label: str, *, positive: bool = False,
                 non_negative: bool = False) -> Decimal:
        if isinstance(value, bool):
            raise PaperLedgerError(label + "_invalid")
        try:
            number = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            raise PaperLedgerError(label + "_invalid") from None
        if not number.is_finite() or (positive and number <= 0) or (non_negative and number < 0):
            raise PaperLedgerError(label + "_invalid")
        return number

    @staticmethod
    def _money(value: Decimal) -> Decimal:
        return value.quantize(MONEY, rounding=ROUND_HALF_UP)

    @staticmethod
    def _fingerprint(payload: dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
        return hashlib.sha256(encoded).hexdigest()

    def submit_proposal(self, *, proposal_id: str, idempotency_key: str, symbol: str,
                        side: str, quantity: Any, reference_price: Any,
                        quote_age_seconds: Any, market_open: bool,
                        risk_decision: dict[str, Any], timestamp: str) -> dict[str, Any]:
        """Simulate a single all-or-nothing fill after independent risk approval."""
        if not isinstance(proposal_id, str) or not proposal_id.strip() or len(proposal_id) > 128:
            raise PaperLedgerError("proposal_id_invalid")
        if not isinstance(idempotency_key, str) or not idempotency_key.strip() or len(idempotency_key) > 128:
            raise PaperLedgerError("idempotency_key_invalid")
        normalized_symbol = symbol.upper() if isinstance(symbol, str) else ""
        if not SYMBOL.fullmatch(normalized_symbol):
            raise PaperLedgerError("symbol_invalid")
        normalized_side = side.upper() if isinstance(side, str) else ""
        if normalized_side not in {"BUY", "SELL"}:
            raise PaperLedgerError("side_invalid")
        qty = self._decimal(quantity, "quantity", positive=True)
        reference = self._decimal(reference_price, "reference_price", positive=True)
        quote_age = self._decimal(quote_age_seconds, "quote_age_seconds", non_negative=True)
        if quote_age > self.max_quote_age_seconds:
            raise PaperLedgerError("stale_market_data")
        if market_open is not True:
            raise PaperLedgerError("market_closed_or_unknown")
        if not isinstance(timestamp, str) or not timestamp.strip() or len(timestamp) > 64:
            raise PaperLedgerError("timestamp_invalid")
        if not isinstance(risk_decision, dict) or risk_decision.get("passed") is not True or risk_decision.get("status") != "allow_paper" or risk_decision.get("live_execution_allowed") is not False:
            raise PaperLedgerError("risk_decision_not_approved_for_paper")

        payload = {
            "proposal_id": proposal_id, "symbol": normalized_symbol, "side": normalized_side,
            "quantity": str(qty), "reference_price": str(reference),
            "quote_age_seconds": str(quote_age), "market_open": market_open,
            "risk_decision_id": str(risk_decision.get("decision_id", "")),
            "risk_policy_version": str(risk_decision.get("policy_version", "")),
            "timestamp": timestamp,
        }
        fingerprint = self._fingerprint(payload)
        prior = self._idempotency.get(idempotency_key)
        if prior:
            if prior[0] != fingerprint:
                raise PaperLedgerError("idempotency_key_payload_conflict")
            return deepcopy(prior[1])

        prior_proposal = self._proposals.get(proposal_id)
        if prior_proposal:
            if prior_proposal[0] != fingerprint:
                raise PaperLedgerError("proposal_id_payload_conflict")
            return deepcopy(prior_proposal[1])

        slip = self.slippage_bps / Decimal("10000")
        fee_rate = self.fee_bps / Decimal("10000")
        fill_price = self._money(reference * (Decimal("1") + slip if normalized_side == "BUY" else Decimal("1") - slip))
        notional = self._money(qty * fill_price)
        if notional > self.max_order_notional:
            raise PaperLedgerError("order_notional_limit")
        fee = self._money(notional * fee_rate)
        realized_pnl = Decimal("0")

        current = self.positions.get(normalized_symbol, {"quantity": Decimal("0"), "cost_basis": Decimal("0")})
        if normalized_side == "BUY":
            total_cost = self._money(notional + fee)
            if total_cost > self.cash:
                raise PaperLedgerError("insufficient_paper_cash")
            self.cash = self._money(self.cash - total_cost)
            self.positions[normalized_symbol] = {
                "quantity": current["quantity"] + qty,
                "cost_basis": self._money(current["cost_basis"] + total_cost),
            }
        else:
            if qty > current["quantity"]:
                raise PaperLedgerError("paper_position_insufficient")
            allocated_basis = self._money(current["cost_basis"] * qty / current["quantity"])
            net_proceeds = self._money(notional - fee)
            realized_pnl = self._money(net_proceeds - allocated_basis)
            self.cash = self._money(self.cash + net_proceeds)
            remaining_qty = current["quantity"] - qty
            remaining_basis = self._money(current["cost_basis"] - allocated_basis)
            if remaining_qty == 0:
                self.positions.pop(normalized_symbol, None)
            else:
                self.positions[normalized_symbol] = {"quantity": remaining_qty, "cost_basis": remaining_basis}

        result = {
            "status": "paper_filled", "execution_mode": "paper",
            "proposal_id": proposal_id, "idempotency_key": idempotency_key,
            "symbol": normalized_symbol, "side": normalized_side,
            "quantity": str(qty), "reference_price": str(reference),
            "simulated_fill_price": str(fill_price), "simulated_notional": str(notional),
            "simulated_fee": str(fee), "realized_pnl": str(self._money(realized_pnl)),
            "cash_balance": str(self.cash), "timestamp": timestamp,
            "broker_order_sent": False, "live_execution_allowed": False,
            "assumptions": {"fee_bps": str(self.fee_bps), "slippage_bps": str(self.slippage_bps),
                            "fill_model": "immediate_adverse_reference_price", "partial_fills": False},
        }
        self.events.append(deepcopy(result))
        self._idempotency[idempotency_key] = (fingerprint, deepcopy(result))
        self._proposals[proposal_id] = (fingerprint, deepcopy(result))
        return deepcopy(result)

    def snapshot(self) -> dict[str, Any]:
        """Return a sanitized immutable-by-copy paper account snapshot."""
        return {
            "mode": "paper", "initial_cash": str(self.initial_cash), "cash_balance": str(self.cash),
            "positions": {symbol: {"quantity": str(row["quantity"]), "cost_basis": str(row["cost_basis"])}
                          for symbol, row in sorted(self.positions.items())},
            "event_count": len(self.events), "broker_order_sent": False,
            "live_execution_allowed": False,
        }
