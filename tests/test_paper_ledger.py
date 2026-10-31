import unittest

from workers.paper_trading.ledger import PaperLedger, PaperLedgerError


APPROVED = {
    "decision_id": "risk-001", "status": "allow_paper", "passed": True,
    "policy_version": "nova-risk-1.0", "live_execution_allowed": False,
}
DENIED = {
    "decision_id": "risk-002", "status": "reject", "passed": False,
    "policy_version": "nova-risk-1.0", "live_execution_allowed": False,
}


def proposal(**overrides):
    values = {
        "proposal_id": "proposal-001", "idempotency_key": "idem-001",
        "symbol": "XAUUSD", "side": "BUY", "quantity": "1",
        "reference_price": "2000", "quote_age_seconds": 1,
        "market_open": True, "risk_decision": APPROVED,
        "timestamp": "2026-10-31T12:00:00Z",
    }
    values.update(overrides)
    return values


class PaperLedgerTests(unittest.TestCase):
    def test_buy_and_sell_accounting_uses_adverse_costs(self):
        ledger = PaperLedger(initial_cash="10000", fee_bps="10", slippage_bps="10")
        buy = ledger.submit_proposal(**proposal())
        self.assertEqual(buy["status"], "paper_filled")
        self.assertEqual(buy["execution_mode"], "paper")
        self.assertEqual(buy["simulated_fill_price"], "2002.00000000")
        self.assertEqual(buy["broker_order_sent"], False)
        self.assertEqual(buy["live_execution_allowed"], False)
        self.assertEqual(ledger.snapshot()["positions"]["XAUUSD"]["quantity"], "1")

        sell = ledger.submit_proposal(**proposal(
            proposal_id="proposal-002", idempotency_key="idem-002", side="SELL",
            reference_price="2010", timestamp="2026-10-31T12:01:00Z"))
        self.assertEqual(sell["simulated_fill_price"], "2007.99000000")
        self.assertEqual(sell["status"], "paper_filled")
        self.assertNotIn("XAUUSD", ledger.snapshot()["positions"])
        self.assertGreater(float(sell["realized_pnl"]), 0)
        self.assertEqual(ledger.snapshot()["broker_order_sent"], False)

    def test_idempotent_replay_returns_same_result_without_double_fill(self):
        ledger = PaperLedger()
        first = ledger.submit_proposal(**proposal())
        replay = ledger.submit_proposal(**proposal())
        self.assertEqual(first, replay)
        self.assertEqual(ledger.snapshot()["event_count"], 1)

    def test_idempotency_key_cannot_be_reused_for_different_payload(self):
        ledger = PaperLedger()
        ledger.submit_proposal(**proposal())
        with self.assertRaisesRegex(PaperLedgerError, "idempotency_key_payload_conflict"):
            ledger.submit_proposal(**proposal(side="SELL"))

    def test_rejects_unapproved_risk_decision(self):
        with self.assertRaisesRegex(PaperLedgerError, "risk_decision_not_approved_for_paper"):
            PaperLedger().submit_proposal(**proposal(risk_decision=DENIED))

    def test_rejects_stale_data_and_closed_market(self):
        ledger = PaperLedger(max_quote_age_seconds=5)
        with self.assertRaisesRegex(PaperLedgerError, "stale_market_data"):
            ledger.submit_proposal(**proposal(quote_age_seconds=6))
        with self.assertRaisesRegex(PaperLedgerError, "market_closed_or_unknown"):
            ledger.submit_proposal(**proposal(idempotency_key="idem-002", market_open=False))

    def test_rejects_insufficient_cash_and_order_size(self):
        with self.assertRaisesRegex(PaperLedgerError, "insufficient_paper_cash"):
            PaperLedger(initial_cash="100").submit_proposal(**proposal())
        with self.assertRaisesRegex(PaperLedgerError, "order_notional_limit"):
            PaperLedger(max_order_notional="100").submit_proposal(**proposal())

    def test_rejects_short_sell_and_position_mutation_without_inventory(self):
        with self.assertRaisesRegex(PaperLedgerError, "paper_position_insufficient"):
            PaperLedger().submit_proposal(**proposal(side="SELL"))

    def test_notional_limit_applies_to_adverse_simulated_fill_price(self):
        ledger = PaperLedger(
            initial_cash="10000", fee_bps="0", slippage_bps="10",
            max_order_notional="2001"
        )
        with self.assertRaisesRegex(PaperLedgerError, "order_notional_limit"):
            ledger.submit_proposal(**proposal())

    def test_rejects_invalid_numbers_and_symbols(self):
        with self.assertRaisesRegex(PaperLedgerError, "quantity_invalid"):
            PaperLedger().submit_proposal(**proposal(quantity="NaN"))
        with self.assertRaisesRegex(PaperLedgerError, "symbol_invalid"):
            PaperLedger().submit_proposal(**proposal(symbol="../account"))

    def test_snapshot_is_copy_and_exposes_no_live_capability(self):
        ledger = PaperLedger()
        ledger.submit_proposal(**proposal())
        snapshot = ledger.snapshot()
        snapshot["positions"]["XAUUSD"]["quantity"] = "999"
        self.assertEqual(ledger.snapshot()["positions"]["XAUUSD"]["quantity"], "1")
        self.assertFalse(ledger.snapshot()["live_execution_allowed"])


if __name__ == "__main__":
    unittest.main()
