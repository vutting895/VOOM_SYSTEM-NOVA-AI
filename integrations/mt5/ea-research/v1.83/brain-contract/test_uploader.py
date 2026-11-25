import unittest
from pathlib import Path
from uploader import account_scope_hmac, canonical, load_schema, validate_event

class EventUploaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.validator = load_schema(Path(__file__).with_name("nova-brain-event.schema.json"))

    def valid_event(self):
        return {
            "schema_version": "1.0",
            "event_id": "a18c2a31-25c7-4b11-8a22-a1c2a3d4e5f6",
            "event_type": "market_snapshot",
            "occurred_at": "2026-11-26T10:00:00Z",
            "source": {
                "component": "mt5_ea", "ea_version": "1.83",
                "source_sha256": "a" * 64, "repo_commit": "b" * 40,
                "symbol": "XAUUSDm", "timeframe": "M5"
            },
            "scope": {"account_scope_hmac": "c" * 64, "magic_scope": 0},
            "market": {"bid": 2000.0, "ask": 2000.2, "bar_closed": True}
        }

    def test_hmac_is_stable_for_same_scope(self):
        self.assertEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-a", "test-key"))

    def test_hmac_separates_scopes(self):
        self.assertNotEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-b", "test-key"))

    def test_hmac_separates_keys(self):
        self.assertNotEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-a", "other-key"))

    def test_canonical_json_orders_keys(self):
        self.assertEqual(canonical({"b": 2, "a": 1}), canonical({"a": 1, "b": 2}))

    def test_hmac_fails_closed_when_missing(self):
        with self.assertRaises(ValueError): account_scope_hmac("", "test-key")
        with self.assertRaises(ValueError): account_scope_hmac("local-scope-a", "")

    def test_full_draft_2020_12_schema_accepts_valid_event(self):
        validate_event(self.valid_event(), self.validator)

    def test_full_schema_rejects_unknown_root_field(self):
        event = self.valid_event()
        event["account_login"] = "not-allowed"
        with self.assertRaises(Exception):
            validate_event(event, self.validator)

    def test_execution_audit_requires_zero_transport_calls(self):
        event = self.valid_event()
        event["event_type"] = "execution_audit"
        event.pop("market")
        event["execution_audit"] = {
            "mode": "READ_ONLY", "broker_request_attempted": False, "broker_transport_calls": 1
        }
        with self.assertRaises(Exception):
            validate_event(event, self.validator)

if __name__ == "__main__":
    unittest.main()
