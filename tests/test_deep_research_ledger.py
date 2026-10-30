"""Tests for tamper-evident, storage-neutral Deep Research event chains."""
import unittest

from workers.deep_research import (
    ContractValidationError,
    append_evidence_event,
    verify_evidence_event_chain,
)


class EvidenceLedgerChainTests(unittest.TestCase):
    def append(self, events=None, **overrides):
        values = {
            "event_id": "event-001",
            "research_id": "research-001",
            "owner_id": "owner-001",
            "event_type": "research_plan_created",
            "recorded_at": "2026-10-31T09:00:00+07:00",
            "payload": {"plan_version": 1, "objective_hash": "a" * 64},
        }
        values.update(overrides)
        return append_evidence_event(events or [], **values)

    def two_event_chain(self):
        first = self.append()
        second = self.append(
            [first],
            event_id="event-002",
            event_type="source_snapshot_registered",
            recorded_at="2026-10-31T09:01:00+07:00",
            payload={"source_id": "source-001", "snapshot_sha256": "b" * 64},
        )
        return [first, second]

    def test_appends_and_verifies_a_two_event_chain(self):
        events = self.two_event_chain()
        verified = verify_evidence_event_chain(events)
        self.assertEqual([event["sequence"] for event in verified], [1, 2])
        self.assertEqual(verified[1]["previous_event_sha256"], verified[0]["event_sha256"])
        self.assertEqual(verified[0]["recorded_at"], "2026-10-31T02:00:00.000000Z")

    def test_hash_is_deterministic_after_timezone_normalization(self):
        offset_event = self.append()
        utc_event = self.append(
            recorded_at="2026-10-31T02:00:00Z"
        )
        self.assertEqual(offset_event, utc_event)

    def test_verifier_rejects_payload_and_envelope_tampering(self):
        events = self.two_event_chain()
        tampered_payload = [dict(event) for event in events]
        tampered_payload[0]["payload"] = {"plan_version": 2}
        with self.assertRaisesRegex(ContractValidationError, "hash verification failed"):
            verify_evidence_event_chain(tampered_payload)

        tampered_owner = [dict(event) for event in events]
        tampered_owner[0]["owner_id"] = "owner-other"
        with self.assertRaisesRegex(ContractValidationError, "hash verification failed"):
            verify_evidence_event_chain(tampered_owner)

    def test_verifier_rejects_deleted_or_reordered_events(self):
        events = self.two_event_chain()
        with self.assertRaisesRegex(ContractValidationError, "sequence mismatch"):
            verify_evidence_event_chain([events[1]])
        with self.assertRaisesRegex(ContractValidationError, "sequence mismatch"):
            verify_evidence_event_chain(list(reversed(events)))

    def test_verifier_rejects_a_broken_previous_hash(self):
        events = self.two_event_chain()
        tampered = [dict(event) for event in events]
        tampered[1]["previous_event_sha256"] = "f" * 64
        with self.assertRaisesRegex(ContractValidationError, "hash verification failed"):
            verify_evidence_event_chain(tampered)

    def test_event_id_is_an_idempotency_key_for_exact_retries(self):
        first = self.append()
        retried = self.append([first])
        self.assertEqual(retried, first)

        second = self.append(
            [first],
            event_id="event-002",
            event_type="source_snapshot_registered",
            recorded_at="2026-10-31T09:01:00+07:00",
            payload={"source_id": "source-001"},
        )
        late_retry = self.append([first, second])
        self.assertEqual(late_retry, first)
        self.assertEqual(late_retry["sequence"], 1)

    def test_event_id_retry_with_different_content_is_rejected(self):
        first = self.append()
        with self.assertRaisesRegex(
            ContractValidationError, "event_id already exists with different event content"
        ):
            self.append([first], payload={"plan_version": 2})

        with self.assertRaisesRegex(
            ContractValidationError, "event_id already exists with different event content"
        ):
            self.append([first], event_type="research_plan_revised")

    def test_append_rejects_duplicate_event_ids_and_mixed_owners(self):
        first = self.append()
        with self.assertRaisesRegex(ContractValidationError, "event_id already exists with different event content"):
            self.append([first], payload={"plan_version": 99})

        with self.assertRaisesRegex(ContractValidationError, "cannot mix owner_id"):
            self.append([first], event_id="event-002", owner_id="owner-002")

        with self.assertRaisesRegex(ContractValidationError, "cannot mix research_id"):
            self.append([first], event_id="event-002", research_id="research-002")

    def test_append_rejects_recorded_time_regression(self):
        first = self.append()
        with self.assertRaisesRegex(ContractValidationError, "must not move backwards"):
            self.append(
                [first],
                event_id="event-002",
                recorded_at="2026-10-31T08:59:59+07:00",
            )

    def test_rejects_secret_like_payload_keys_at_any_depth(self):
        for payload in (
            {"access_token": "do-not-store"},
            {"metadata": {"api-key": "do-not-store"}},
            {"apiKey": "do-not-store"},
            {"refreshToken": "do-not-store"},
            {"serviceRoleKey": "do-not-store"},
            {"authorization": "Bearer do-not-store"},
        ):
            with self.subTest(payload=payload), self.assertRaisesRegex(
                ContractValidationError, "credential field"
            ):
                self.append(payload=payload)

    def test_rejects_unknown_event_types_and_non_json_payloads(self):
        with self.assertRaisesRegex(ContractValidationError, "event_type is not supported"):
            self.append(event_type="run_arbitrary_tool")

        with self.assertRaises(ContractValidationError):
            self.append(payload={"invalid": float("nan")})

        with self.assertRaises(ContractValidationError):
            self.append(payload={"invalid": object()})

    def test_rejects_oversized_payloads(self):
        with self.assertRaisesRegex(ContractValidationError, "exceeds the"):
            self.append(payload={"summary": "x" * (64 * 1024)})

    def test_chain_verification_returns_an_empty_copy_for_empty_chain(self):
        self.assertEqual(verify_evidence_event_chain([]), [])

    def test_appending_does_not_mutate_the_existing_chain_or_payload(self):
        first = self.append()
        original = [dict(first)]
        new_event = self.append(original, event_id="event-002")
        self.assertEqual(len(original), 1)
        self.assertEqual(new_event["sequence"], 2)
        self.assertEqual(first["payload"]["plan_version"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
