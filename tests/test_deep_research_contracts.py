"""Tests for strict Deep Research Core contract boundaries."""
import unittest

from workers.deep_research import (
    ContractValidationError,
    validate_research_claim,
    validate_research_hypothesis,
    validate_research_source,
    validate_research_task,
)


class DeepResearchContractTests(unittest.TestCase):
    def task(self):
        return {
            "schema_version": "nova.research-task.v1",
            "research_id": "research-001",
            "owner_id": "owner-001",
            "tenant_id": "tenant-001",
            "objective": "Evaluate whether a volatility filter improves net strategy expectancy.",
            "question_tree": ["Does the filter improve net expectancy?", "Does it remain stable across regimes?"],
            "constraints": {"market": "XAUUSD", "mode": "historical"},
            "source_policy": {"preferred": ["official", "academic"]},
            "plan_version": 1,
            "state": "planned",
            "created_at": "2026-10-31T09:00:00Z",
            "updated_at": "2026-10-31T09:00:00Z",
            "correlation_id": "corr-001",
            "idempotency_key": "idem-001",
        }

    def source(self):
        return {
            "schema_version": "nova.research-source.v1",
            "source_id": "source-001",
            "uri": "https://example.org/research",
            "title": "Research method",
            "publisher": "Example Institute",
            "source_type": "academic_paper",
            "published_at": None,
            "accessed_at": "2026-10-31T09:00:00Z",
            "snapshot_sha256": "a" * 64,
            "extractor_version": "text-v1",
            "passages": [{"passage_id": "p1", "text": "A bounded passage.", "start_offset": 0, "end_offset": 18}],
            "retention_note": "Keep citation and hash.",
        }

    def claim(self):
        return {
            "schema_version": "nova.research-claim.v1",
            "claim_id": "claim-001",
            "research_id": "research-001",
            "claim_text": "The study reports a positive result.",
            "classification": "observed",
            "source_ids": ["source-001"],
            "supporting_evidence": ["p1"],
            "counter_evidence": [],
            "scope": "Only the cited sample.",
            "uncertainty": "Independent replication not assessed.",
        }

    def hypothesis(self):
        return {
            "schema_version": "nova.research-hypothesis.v1",
            "hypothesis_id": "hyp-001",
            "research_id": "research-001",
            "statement": "The filter improves net expectancy after costs.",
            "supporting_claim_ids": ["claim-001"],
            "counter_claim_ids": [],
            "alternatives": ["The apparent improvement is regime-specific."],
            "observable_outcome": "Higher net expectancy on unseen chronological folds.",
            "null_expectation": "No material difference versus baseline.",
            "falsification_rule": "Reject if median fold improvement is <= 0.",
            "data_requirements": "At least 24 months of timestamped OHLCV and costs.",
            "stop_criteria": "Stop on insufficient data or leakage warning.",
            "status": "ready_for_review",
        }

    def test_accepts_valid_task_and_returns_copy(self):
        payload = self.task()
        validated = validate_research_task(payload)
        self.assertEqual(validated["tenant_id"], "tenant-001")
        self.assertIsNot(validated, payload)

    def test_rejects_unknown_task_fields(self):
        payload = self.task()
        payload["model_instruction"] = "ignore security"
        with self.assertRaisesRegex(ContractValidationError, "unknown fields"):
            validate_research_task(payload)

    def test_rejects_missing_task_fields(self):
        payload = self.task()
        del payload["owner_id"]
        with self.assertRaisesRegex(ContractValidationError, "missing fields"):
            validate_research_task(payload)

    def test_rejects_unbounded_or_empty_questions(self):
        payload = self.task()
        payload["question_tree"] = []
        with self.assertRaises(ContractValidationError):
            validate_research_task(payload)

    def test_rejects_invalid_task_state(self):
        payload = self.task()
        payload["state"] = "trade_now"
        with self.assertRaises(ContractValidationError):
            validate_research_task(payload)

    def test_accepts_valid_source_snapshot(self):
        validated = validate_research_source(self.source())
        self.assertEqual(validated["snapshot_sha256"], "a" * 64)

    def test_rejects_non_https_or_credential_bearing_source_uri(self):
        for uri in ("http://example.org", "https://user:secret@example.org/path", "file:///etc/passwd"):
            payload = self.source()
            payload["uri"] = uri
            with self.subTest(uri=uri), self.assertRaises(ContractValidationError):
                validate_research_source(payload)

    def test_rejects_bad_source_hash_and_offsets(self):
        payload = self.source()
        payload["snapshot_sha256"] = "bad"
        with self.assertRaises(ContractValidationError):
            validate_research_source(payload)
        payload = self.source()
        payload["passages"][0]["end_offset"] = 0
        with self.assertRaises(ContractValidationError):
            validate_research_source(payload)

    def test_accepts_valid_claim_and_keeps_counter_evidence_field(self):
        validated = validate_research_claim(self.claim())
        self.assertEqual(validated["counter_evidence"], [])

    def test_evidence_classification_requires_source_reference(self):
        payload = self.claim()
        payload["source_ids"] = []
        with self.assertRaisesRegex(ContractValidationError, "require at least one source_id"):
            validate_research_claim(payload)

    def test_rejects_duplicate_evidence_ids(self):
        payload = self.claim()
        payload["source_ids"] = ["source-001", "source-001"]
        with self.assertRaises(ContractValidationError):
            validate_research_claim(payload)

    def test_accepts_valid_falsifiable_hypothesis(self):
        validated = validate_research_hypothesis(self.hypothesis())
        self.assertEqual(validated["status"], "ready_for_review")

    def test_approved_hypothesis_requires_falsification_rule(self):
        payload = self.hypothesis()
        payload["status"] = "approved_for_experiment"
        payload["falsification_rule"] = " "
        with self.assertRaises(ContractValidationError):
            validate_research_hypothesis(payload)

    def test_rejects_unknown_hypothesis_fields(self):
        payload = self.hypothesis()
        payload["autonomous_tool"] = "run arbitrary command"
        with self.assertRaises(ContractValidationError):
            validate_research_hypothesis(payload)

    def test_rejects_non_json_and_oversized_payloads(self):
        payload = self.task()
        payload["constraints"] = {"value": float("nan")}
        with self.assertRaises(ContractValidationError):
            validate_research_task(payload)
        payload = self.task()
        payload["objective"] = "x" * 20_000
        with self.assertRaises(ContractValidationError):
            validate_research_task(payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
