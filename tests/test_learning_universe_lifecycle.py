import unittest

from workers.learning_universe import (
    LearningLifecycleError,
    LearningState,
    create_cycle,
    transition_cycle,
)


NOW = "2026-10-31T04:00:00+07:00"
SHA256 = "a" * 64
GIT_SHA = "b" * 40


def advance(cycle, state, evidence, actor_type="service"):
    return transition_cycle(
        cycle,
        state,
        evidence,
        actor_type=actor_type,
        actor_id="trusted-test-harness",
        occurred_at=NOW,
    )


def fully_evaluated_cycle():
    cycle = create_cycle("cycle-test-001", NOW)
    cycle = advance(
        cycle,
        LearningState.DATA_VALIDATED,
        {
            "dataset_manifest_id": "dataset-001",
            "dataset_sha256": SHA256,
            "quality_report_id": "quality-001",
            "data_quality_passed": True,
        },
    )
    cycle = advance(
        cycle,
        LearningState.EXPERIMENT_READY,
        {
            "feature_contract_id": "features.v1",
            "feature_contract_version": "1.0.0",
            "feature_contract_approved": True,
            "label_contract_id": "labels.v1",
            "label_contract_version": "1.0.0",
            "label_contract_approved": True,
            "code_revision": GIT_SHA,
            "evaluation_plan_id": "walk-forward-001",
            "cost_model_id": "conservative-costs-v1",
            "baseline_id": "ema-baseline-v1",
            "purge_bars": 12,
            "embargo_bars": 2,
            "seed": 17,
            "final_oos_reserved": True,
        },
    )
    cycle = advance(
        cycle,
        LearningState.EVALUATED,
        {
            "evaluation_report_id": "evaluation-001",
            "evaluation_report_sha256": SHA256,
            "reproducibility_receipt_id": "replay-001",
            "out_of_sample_windows": 3,
            "final_oos_untouched": True,
            "cost_sensitivity_passed": True,
            "baseline_comparison_passed": True,
            "risk_guardrails_passed": True,
        },
    )
    return advance(
        cycle,
        LearningState.REVIEW_PENDING,
        {
            "candidate_report_id": "candidate-001",
            "review_packet_sha256": SHA256,
        },
    )


class LearningUniverseLifecycleTests(unittest.TestCase):
    def test_create_cycle_is_research_only_and_starts_in_draft(self):
        cycle = create_cycle("cycle-test-001", NOW)
        self.assertEqual(cycle["state"], LearningState.DRAFT.value)
        self.assertTrue(cycle["research_only"])
        self.assertFalse(cycle["trade_authorized"])
        self.assertFalse(cycle["order_submission_enabled"])
        self.assertFalse(cycle["live_trading_enabled"])

    def test_rejects_naive_timestamp(self):
        with self.assertRaises(LearningLifecycleError):
            create_cycle("cycle-test-001", "2026-10-31T04:00:00")

    def test_rejects_invalid_cycle_id(self):
        with self.assertRaises(LearningLifecycleError):
            create_cycle("../unsafe", NOW)

    def test_cannot_skip_data_validation(self):
        cycle = create_cycle("cycle-test-001", NOW)
        with self.assertRaises(LearningLifecycleError):
            advance(cycle, LearningState.EXPERIMENT_READY, {})

    def test_data_gate_requires_hashed_dataset_and_quality_pass(self):
        cycle = create_cycle("cycle-test-001", NOW)
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.DATA_VALIDATED,
                {
                    "dataset_manifest_id": "dataset-001",
                    "dataset_sha256": "not-a-hash",
                    "quality_report_id": "quality-001",
                    "data_quality_passed": False,
                },
            )

    def test_experiment_gate_requires_approved_feature_and_label_contracts(self):
        cycle = create_cycle("cycle-test-001", NOW)
        cycle = advance(
            cycle,
            LearningState.DATA_VALIDATED,
            {
                "dataset_manifest_id": "dataset-001",
                "dataset_sha256": SHA256,
                "quality_report_id": "quality-001",
                "data_quality_passed": True,
            },
        )
        with self.assertRaises(LearningLifecycleError):
            advance(cycle, LearningState.EXPERIMENT_READY, {})

    def test_evaluation_gate_rejects_touched_final_oos(self):
        cycle = create_cycle("cycle-test-001", NOW)
        cycle = advance(
            cycle,
            LearningState.DATA_VALIDATED,
            {
                "dataset_manifest_id": "dataset-001",
                "dataset_sha256": SHA256,
                "quality_report_id": "quality-001",
                "data_quality_passed": True,
            },
        )
        cycle = advance(
            cycle,
            LearningState.EXPERIMENT_READY,
            {
                "feature_contract_id": "features.v1",
                "feature_contract_version": "1.0.0",
                "feature_contract_approved": True,
                "label_contract_id": "labels.v1",
                "label_contract_version": "1.0.0",
                "label_contract_approved": True,
                "code_revision": GIT_SHA,
                "evaluation_plan_id": "walk-forward-001",
                "cost_model_id": "conservative-costs-v1",
                "baseline_id": "ema-baseline-v1",
                "purge_bars": 0,
                "embargo_bars": 0,
                "seed": 1,
                "final_oos_reserved": True,
            },
        )
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.EVALUATED,
                {
                    "evaluation_report_id": "evaluation-001",
                    "evaluation_report_sha256": SHA256,
                    "reproducibility_receipt_id": "replay-001",
                    "out_of_sample_windows": 2,
                    "final_oos_untouched": False,
                    "cost_sensitivity_passed": True,
                    "baseline_comparison_passed": True,
                    "risk_guardrails_passed": True,
                },
            )

    def test_full_path_requires_explicit_human_approval_for_shadow_only(self):
        cycle = fully_evaluated_cycle()
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.APPROVED_FOR_SHADOW,
                {
                    "human_review_id": "review-001",
                    "review_rationale": "Evidence reviewed",
                    "approval_scope": "production",
                    "shadow_plan_id": "shadow-001",
                },
                actor_type="human",
            )

        approved = advance(
            cycle,
            LearningState.APPROVED_FOR_SHADOW,
            {
                "human_review_id": "review-001",
                "review_rationale": "Evidence reviewed; paper/shadow scope only",
                "approval_scope": "paper_shadow_only",
                "shadow_plan_id": "shadow-001",
            },
            actor_type="human",
        )
        self.assertEqual(approved["state"], LearningState.APPROVED_FOR_SHADOW.value)
        self.assertEqual(approved["revision"], cycle["revision"] + 1)
        self.assertFalse(approved["trade_authorized"])
        self.assertFalse(approved["order_submission_enabled"])
        self.assertFalse(approved["live_trading_enabled"])

    def test_model_cannot_approve_candidate(self):
        cycle = fully_evaluated_cycle()
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.APPROVED_FOR_SHADOW,
                {
                    "human_review_id": "review-001",
                    "review_rationale": "Looks good",
                    "approval_scope": "paper_shadow_only",
                    "shadow_plan_id": "shadow-001",
                },
                actor_type="model",
            )

    def test_approval_is_terminal_and_production_state_does_not_exist(self):
        cycle = fully_evaluated_cycle()
        approved = advance(
            cycle,
            LearningState.APPROVED_FOR_SHADOW,
            {
                "human_review_id": "review-001",
                "review_rationale": "Paper-only review",
                "approval_scope": "paper_shadow_only",
                "shadow_plan_id": "shadow-001",
            },
            actor_type="human",
        )
        with self.assertRaises(LearningLifecycleError):
            advance(approved, "PROMOTED_TO_PRODUCTION", {})

    def test_rejection_requires_human_reason(self):
        cycle = fully_evaluated_cycle()
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.REJECTED,
                {"human_review_id": "review-001", "review_rationale": "Rejected"},
            )

    def test_evidence_cannot_contain_broker_secrets_or_account_fields(self):
        cycle = create_cycle("cycle-test-001", NOW)
        with self.assertRaises(LearningLifecycleError):
            advance(
                cycle,
                LearningState.DATA_VALIDATED,
                {
                    "dataset_manifest_id": "dataset-001",
                    "dataset_sha256": SHA256,
                    "quality_report_id": "quality-001",
                    "data_quality_passed": True,
                    "broker_token": "must-not-be-stored",
                },
            )


if __name__ == "__main__":
    unittest.main()
