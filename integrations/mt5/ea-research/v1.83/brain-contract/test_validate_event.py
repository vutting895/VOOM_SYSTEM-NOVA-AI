"""Unit tests for the NOVA EA -> Brain read-only event contract."""
import unittest

from validate_event import EventValidationError, validate_event


def sample_event():
    return {
        "schema_version": "1.0",
        "event_id": "4b2b9e2a-3b2c-4f6d-8b5a-7c4f1b8a2d90",
        "event_type": "signal",
        "occurred_at": "2026-11-26T02:00:00Z",
        "source": {
            "component": "mt5_ea",
            "ea_version": "1.83",
            "source_sha256": "a" * 64,
            "repo_commit": "b" * 40,
            "symbol": "XAUUSDm",
            "timeframe": "M15",
        },
        "scope": {"account_scope_hash": "c" * 64, "magic_scope": 991830},
        "market": {
            "bid": 2640.1,
            "ask": 2640.3,
            "spread_points": 20,
            "atr": 4.2,
            "bar_time_utc": "2026-11-26T01:45:00Z",
            "bar_closed": True,
            "data_quality": "PASS",
        },
        "signal": {
            "strategy": "SMC_MTF_RESEARCH",
            "side": "BUY",
            "score": 0.72,
            "reason_codes": ["SWEEP_CONFIRMED", "DISPLACEMENT", "CHOCH", "H1_TREND_ALIGNED"],
            "feature_hash": "d" * 64,
        },
    }


class BrainEventContractTests(unittest.TestCase):
    def test_valid_closed_bar_signal(self):
        self.assertIs(validate_event(sample_event()), sample_event() if False else validate_event(sample_event()))

    def test_rejects_missing_source_hash(self):
        event = sample_event()
        event["source"]["source_sha256"] = "not-a-hash"
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_non_utc_timestamp(self):
        event = sample_event()
        event["occurred_at"] = "2026-11-26T09:00:00+07:00"
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_open_bar_signal(self):
        event = sample_event()
        event["market"]["bar_closed"] = False
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_account_identifiers_and_secrets(self):
        event = sample_event()
        event["scope"]["account_login"] = 12345678
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_execution_audit_with_transport_calls(self):
        event = sample_event()
        event["event_type"] = "execution_audit"
        event.pop("signal")
        event["execution_audit"] = {
            "mode": "READ_ONLY",
            "broker_request_attempted": False,
            "broker_transport_calls": 1,
        }
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_decision_without_reason_codes(self):
        event = sample_event()
        event["event_type"] = "decision"
        event.pop("signal")
        event["decision"] = {
            "result": "ACCEPT",
            "model_version": "brain-dev-0.1",
            "reason_codes": [],
        }
        with self.assertRaises(EventValidationError):
            validate_event(event)

    def test_rejects_unknown_event_type(self):
        event = sample_event()
        event["event_type"] = "place_order"
        with self.assertRaises(EventValidationError):
            validate_event(event)


if __name__ == "__main__":
    unittest.main()
