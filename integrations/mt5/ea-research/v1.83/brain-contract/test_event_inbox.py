"""Tests for the tenant-scoped NOVA Brain event inbox."""
import json
import os
import tempfile
import unittest

from event_inbox import EventIdConflict, IngestionError, SQLiteEventInbox


def sample_event():
    return {
        "schema_version": "1.0",
        "event_id": "4b2b9e2a-3b2c-4f6d-8b5a-7c4f1b8a2d90",
        "event_type": "signal",
        "occurred_at": "2026-11-26T02:00:00Z",
        "source": {
            "component": "mt5_ea", "ea_version": "1.83",
            "source_sha256": "a" * 64, "repo_commit": "b" * 40,
            "symbol": "XAUUSDm", "timeframe": "M15",
        },
        "scope": {"account_scope_hmac": "c" * 64, "magic_scope": 991830},
        "market": {
            "bid": 2640.1, "ask": 2640.3, "spread_points": 20,
            "atr": 4.2, "bar_time_utc": "2026-11-26T01:45:00Z",
            "bar_closed": True, "data_quality": "PASS",
        },
        "signal": {
            "strategy": "SMC_MTF_RESEARCH", "side": "BUY", "score": 0.72,
            "reason_codes": ["SWEEP_CONFIRMED"],
        },
    }


class EventInboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "events.sqlite3")
        self.inbox = SQLiteEventInbox(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_insert_then_idempotent_duplicate(self):
        event = sample_event()
        first = self.inbox.ingest("tenant-a", event)
        second = self.inbox.ingest("tenant-a", event)
        self.assertEqual(first.status, "inserted")
        self.assertEqual(second.status, "duplicate")
        self.assertEqual(self.inbox.count_for_tenant("tenant-a"), 1)

    def test_same_event_id_isolated_by_tenant(self):
        event = sample_event()
        self.assertEqual(self.inbox.ingest("tenant-a", event).status, "inserted")
        self.assertEqual(self.inbox.ingest("tenant-b", event).status, "inserted")
        self.assertEqual(self.inbox.count_for_tenant("tenant-a"), 1)
        self.assertEqual(self.inbox.count_for_tenant("tenant-b"), 1)

    def test_reused_id_with_changed_payload_conflicts(self):
        self.inbox.ingest("tenant-a", sample_event())
        changed = sample_event()
        changed["signal"]["score"] = 0.73
        with self.assertRaises(EventIdConflict):
            self.inbox.ingest("tenant-a", changed)

    def test_invalid_event_rejected_before_storage(self):
        event = sample_event()
        event["market"]["bar_closed"] = False
        with self.assertRaises(ValueError):
            self.inbox.ingest("tenant-a", event)
        self.assertEqual(self.inbox.count_for_tenant("tenant-a"), 0)

    def test_untrusted_or_invalid_tenant_rejected(self):
        with self.assertRaises(IngestionError):
            self.inbox.ingest("../tenant", sample_event())
        with self.assertRaises(IngestionError):
            self.inbox.ingest("", sample_event())

    def test_payload_read_is_tenant_scoped(self):
        event = sample_event()
        self.inbox.ingest("tenant-a", event)
        self.assertEqual(self.inbox.get_for_tenant("tenant-a", event["event_id"]), event)
        self.assertIsNone(self.inbox.get_for_tenant("tenant-b", event["event_id"]))

    def test_event_payload_cannot_override_tenant(self):
        event = sample_event()
        event["tenant_id"] = "tenant-victim"
        # The strict event validator rejects unknown top-level properties at
        # the schema boundary; the dependency-free validator is supplemented
        # here by ensuring tenant identity is only ever a separate argument.
        with self.assertRaises(ValueError):
            self.inbox.ingest("tenant-a", event)


if __name__ == "__main__":
    unittest.main()
