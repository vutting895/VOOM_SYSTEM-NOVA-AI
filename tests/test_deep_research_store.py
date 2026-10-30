"""Tests for the atomic Evidence Ledger storage boundary."""
import unittest

from workers.deep_research import (
    ContractValidationError,
    append_evidence_event,
    append_event_to_store,
    verify_evidence_event_chain,
)
from workers.deep_research.ledger import GENESIS_SHA256
from workers.deep_research.store import LedgerConcurrencyError


class FakeCompareAndSwapStore:
    """In-memory test double; not a production persistence implementation."""

    def __init__(self):
        self.events = []
        self.conflicts_remaining = 0
        self.always_conflict = False
        self.return_unscoped_chain = False

    def load_chain(self, *, research_id, owner_id):
        if self.return_unscoped_chain:
            return list(self.events)
        return [
            event for event in self.events
            if event["research_id"] == research_id and event["owner_id"] == owner_id
        ]

    def append_if_head_matches(
        self, *, research_id, owner_id, expected_head_sha256, event
    ):
        if self.always_conflict:
            return False

        if self.conflicts_remaining:
            self.conflicts_remaining -= 1
            competing = append_evidence_event(
                self.events,
                event_id="competing-event",
                research_id=research_id,
                owner_id=owner_id,
                event_type="source_snapshot_registered",
                recorded_at="2026-10-31T09:00:30Z",
                payload={"source_id": "source-race"},
            )
            self.events.append(competing)
            return False

        actual_head = (
            self.events[-1]["event_sha256"] if self.events else GENESIS_SHA256
        )
        if actual_head != expected_head_sha256:
            return False
        if event["research_id"] != research_id or event["owner_id"] != owner_id:
            raise AssertionError("test store was asked to append outside requested scope")
        if any(row["event_id"] == event["event_id"] for row in self.events):
            return False

        # Verify before accepting in this test double to model a defensive adapter.
        verify_evidence_event_chain(self.events + [event])
        self.events.append(event)
        return True


class EvidenceLedgerStoreContractTests(unittest.TestCase):
    def call_append(self, store, **overrides):
        values = {
            "event_id": "event-001",
            "research_id": "research-001",
            "owner_id": "owner-001",
            "event_type": "research_plan_created",
            "recorded_at": "2026-10-31T09:00:00+07:00",
            "payload": {"plan_version": 1},
            "max_attempts": 3,
        }
        values.update(overrides)
        return append_event_to_store(store, **values)

    def test_appends_through_store_contract_and_can_read_back(self):
        store = FakeCompareAndSwapStore()
        event = self.call_append(store)
        self.assertEqual(event["sequence"], 1)
        self.assertEqual(len(store.events), 1)
        self.assertEqual(verify_evidence_event_chain(store.events), [event])

    def test_repeated_exact_request_is_idempotent(self):
        store = FakeCompareAndSwapStore()
        first = self.call_append(store)
        retried = self.call_append(store)
        self.assertEqual(retried, first)
        self.assertEqual(len(store.events), 1)

    def test_reused_event_id_with_changed_content_is_rejected(self):
        store = FakeCompareAndSwapStore()
        self.call_append(store)
        with self.assertRaisesRegex(
            ContractValidationError, "event_id already exists with different event content"
        ):
            self.call_append(store, payload={"plan_version": 2})
        self.assertEqual(len(store.events), 1)

    def test_compare_and_swap_conflict_reloads_and_retries(self):
        store = FakeCompareAndSwapStore()
        store.conflicts_remaining = 1
        event = self.call_append(
            store,
            event_id="client-event",
            event_type="claim_recorded",
            recorded_at="2026-10-31T09:01:00+07:00",
            payload={"claim_id": "claim-001"},
        )
        self.assertEqual([item["sequence"] for item in store.events], [1, 2])
        self.assertEqual(event["event_id"], "client-event")
        self.assertEqual(event["sequence"], 2)
        verify_evidence_event_chain(store.events)

    def test_bounded_conflicts_raise_concurrency_error(self):
        store = FakeCompareAndSwapStore()
        store.always_conflict = True
        with self.assertRaisesRegex(LedgerConcurrencyError, "2 bounded append attempts"):
            self.call_append(store, max_attempts=2)
        self.assertEqual(store.events, [])

    def test_rejects_a_store_that_returns_another_owner_chain(self):
        store = FakeCompareAndSwapStore()
        other_owner_event = append_evidence_event(
            [],
            event_id="foreign-event",
            research_id="research-001",
            owner_id="owner-foreign",
            event_type="research_plan_created",
            recorded_at="2026-10-31T09:00:00Z",
            payload={"plan_version": 1},
        )
        store.events.append(other_owner_event)
        store.return_unscoped_chain = True
        with self.assertRaisesRegex(
            ContractValidationError, "outside the requested owner/research scope"
        ):
            self.call_append(store)

    def test_attempt_limit_is_bounded_and_validated(self):
        store = FakeCompareAndSwapStore()
        for attempts in (0, 11, True, 1.5):
            with self.subTest(attempts=attempts), self.assertRaisesRegex(
                ContractValidationError, "max_attempts"
            ):
                self.call_append(store, max_attempts=attempts)

    def test_store_load_scope_is_always_explicit(self):
        store = FakeCompareAndSwapStore()
        event = self.call_append(store)
        self.assertEqual(event["owner_id"], "owner-001")
        self.assertEqual(event["research_id"], "research-001")


if __name__ == "__main__":
    unittest.main(verbosity=2)
