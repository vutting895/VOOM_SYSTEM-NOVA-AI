import unittest
from datetime import datetime

from workers.agent_orchestration.approval_resume import (
    ApprovalDecisionSnapshot,
    validate_approval_resume,
)
from workers.agent_orchestration.contracts import (
    AGENT_STATE_SCHEMA,
    ContractError,
    AgentRunState,
    ToolCall,
    ToolContract,
    validate_agent_state,
    validate_tool_call,
    validate_tool_registry,
)

RUN_ID = "11111111-1111-4111-8111-111111111111"
THREAD_ID = "22222222-2222-4222-8222-222222222222"
CALL_ID = "33333333-3333-4333-8333-333333333333"
IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444"
APPROVAL_ID = "55555555-5555-4555-8555-555555555555"
NOW = "2026-10-31T01:00:00+07:00"
PENDING_HASH = "a" * 64
OWNER_ID = "66666666-6666-4666-8666-666666666666"
APPROVAL_POLICY_VERSION = "nova-approval.v1"


class AgentOrchestrationContractTests(unittest.TestCase):
    def valid_state(self, **overrides):
        values = {
            "schema_version": AGENT_STATE_SCHEMA,
            "run_id": RUN_ID,
            "thread_id": THREAD_ID,
            "intent": "market_analysis",
            "status": "running",
            "step_count": 1,
            "max_steps": 8,
            "policy_version": "nova.agent-policy.v1",
            "created_at": NOW,
            "updated_at": NOW,
        }
        values.update(overrides)
        return AgentRunState(**values)

    def valid_waiting_state(self, **overrides):
        values = {
            "status": "awaiting_approval",
            "pending_approval_id": APPROVAL_ID,
            "pending_proposal_hash": PENDING_HASH,
            "pending_approval_policy_version": APPROVAL_POLICY_VERSION,
        }
        values.update(overrides)
        return self.valid_state(**values)

    def valid_approval(self, **overrides):
        values = {
            "approval_id": APPROVAL_ID,
            "thread_id": THREAD_ID,
            "owner_id": OWNER_ID,
            "status": "approved",
            "proposal_hash": PENDING_HASH,
            "policy_version": APPROVAL_POLICY_VERSION,
            "expires_at": "2026-10-31T02:00:00+07:00",
            "decided_at": "2026-10-31T01:30:00+07:00",
        }
        values.update(overrides)
        return ApprovalDecisionSnapshot(**values)

    def test_accepts_valid_read_only_tool_call(self):
        registry = validate_tool_registry(
            [ToolContract(name="get_market_quotes", version="v1", side_effect="none")]
        )
        call = ToolCall(
            tool_name="get_market_quotes",
            call_id=CALL_ID,
            idempotency_key=IDEMPOTENCY_KEY,
            arguments={"symbol": "XAUUSDm", "timeframe": "M5", "limit": 20},
        )
        self.assertIs(validate_tool_call(call, registry), call)

    def test_rejects_tool_not_in_server_allowlist(self):
        with self.assertRaisesRegex(ContractError, "allowlist"):
            validate_tool_call(
                ToolCall("get_market_quotes", CALL_ID, IDEMPOTENCY_KEY, {}), {}
            )

    def test_rejects_broker_order_tool_by_name(self):
        with self.assertRaisesRegex(ContractError, "forbidden"):
            validate_tool_registry(
                [ToolContract(name="execute_broker_order", version="v1")]
            )

    def test_rejects_broker_write_effect_even_with_human_review(self):
        with self.assertRaisesRegex(ContractError, "broker writes"):
            validate_tool_registry(
                [
                    ToolContract(
                        name="submit_trade_request",
                        version="v1",
                        side_effect="broker_write",
                        approval_mode="human_review",
                    )
                ]
            )

    def test_requires_human_review_for_draft_write(self):
        with self.assertRaisesRegex(ContractError, "require human review"):
            validate_tool_registry(
                [ToolContract(name="save_strategy_draft", version="v1", side_effect="draft_write")]
            )

    def test_accepts_review_gated_draft_write_contract(self):
        registry = validate_tool_registry(
            [
                ToolContract(
                    name="save_strategy_draft",
                    version="v1",
                    side_effect="draft_write",
                    approval_mode="human_review",
                    idempotent=True,
                )
            ]
        )
        self.assertIn("save_strategy_draft", registry)

    def test_rejects_non_idempotent_retries(self):
        with self.assertRaisesRegex(ContractError, "non-idempotent"):
            validate_tool_registry(
                [
                    ToolContract(
                        name="write_draft_event",
                        version="v1",
                        side_effect="draft_write",
                        approval_mode="human_review",
                        idempotent=False,
                        max_retries=1,
                    )
                ]
            )

    def test_rejects_server_owned_identity_argument(self):
        registry = validate_tool_registry(
            [ToolContract(name="get_market_quotes", version="v1")]
        )
        call = ToolCall(
            "get_market_quotes",
            CALL_ID,
            IDEMPOTENCY_KEY,
            {"symbol": "XAUUSDm", "connection_id": "foreign-connection"},
        )
        with self.assertRaisesRegex(ContractError, "server-owned"):
            validate_tool_call(call, registry)

    def test_rejects_secret_argument(self):
        registry = validate_tool_registry(
            [ToolContract(name="get_market_quotes", version="v1")]
        )
        call = ToolCall(
            "get_market_quotes",
            CALL_ID,
            IDEMPOTENCY_KEY,
            {"symbol": "XAUUSDm", "access_token": "do-not-store"},
        )
        with self.assertRaisesRegex(ContractError, "server-owned"):
            validate_tool_call(call, registry)

    def test_rejects_tool_arguments_over_size_limit(self):
        registry = validate_tool_registry(
            [ToolContract(name="search_research_sources", version="v1")]
        )
        call = ToolCall(
            "search_research_sources",
            CALL_ID,
            IDEMPOTENCY_KEY,
            {"query": "x" * 9_000},
        )
        with self.assertRaisesRegex(ContractError, "oversized string"):
            validate_tool_call(call, registry)

    def test_rejects_non_finite_json(self):
        registry = validate_tool_registry(
            [ToolContract(name="run_paper_backtest", version="v1")]
        )
        call = ToolCall(
            "run_paper_backtest",
            CALL_ID,
            IDEMPOTENCY_KEY,
            {"threshold": float("nan")},
        )
        with self.assertRaisesRegex(ContractError, "non-finite"):
            validate_tool_call(call, registry)

    def test_rejects_invalid_tool_name_type(self):
        with self.assertRaisesRegex(ContractError, "tool name"):
            validate_tool_registry([ToolContract(name=None, version="v1")])

    def test_rejects_invalid_registry_type(self):
        with self.assertRaisesRegex(ContractError, "sequence"):
            validate_tool_registry(None)

    def test_rejects_invalid_tool_call_name_type(self):
        registry = validate_tool_registry(
            [ToolContract(name="get_market_quotes", version="v1")]
        )
        call = ToolCall(None, CALL_ID, IDEMPOTENCY_KEY, {})
        with self.assertRaisesRegex(ContractError, "tool_name"):
            validate_tool_call(call, registry)

    def test_rejects_duplicate_registry_names(self):
        with self.assertRaisesRegex(ContractError, "duplicate"):
            validate_tool_registry(
                [
                    ToolContract(name="get_market_quotes", version="v1"),
                    ToolContract(name="get_market_quotes", version="v1"),
                ]
            )

    def test_accepts_valid_agent_state(self):
        state = self.valid_state()
        self.assertEqual(validate_agent_state(state), state)

    def test_requires_approval_id_when_waiting(self):
        with self.assertRaisesRegex(ContractError, "requires pending_approval_id"):
            validate_agent_state(self.valid_state(status="awaiting_approval"))

    def test_pending_approval_id_only_valid_in_waiting_state(self):
        with self.assertRaisesRegex(ContractError, "only while awaiting"):
            validate_agent_state(self.valid_state(pending_approval_id=APPROVAL_ID))

    def test_rejects_run_budget_above_hard_limit(self):
        with self.assertRaisesRegex(ContractError, "step budget"):
            validate_agent_state(self.valid_state(step_count=13, max_steps=13))

    def test_rejects_naive_timestamps(self):
        with self.assertRaisesRegex(ContractError, "include a timezone"):
            validate_agent_state(self.valid_state(created_at="2026-10-31T01:00:00"))

    def test_accepts_waiting_state_with_approval_reference(self):
        state = self.valid_waiting_state()
        self.assertEqual(validate_agent_state(state), state)

    def test_awaiting_approval_requires_proposal_hash(self):
        with self.assertRaisesRegex(ContractError, "requires pending_proposal_hash"):
            validate_agent_state(
                self.valid_state(
                    status="awaiting_approval",
                    pending_approval_id=APPROVAL_ID,
                    pending_approval_policy_version=APPROVAL_POLICY_VERSION,
                )
            )

    def test_awaiting_approval_requires_approval_policy_version(self):
        with self.assertRaisesRegex(ContractError, "requires pending_approval_policy_version"):
            validate_agent_state(
                self.valid_state(
                    status="awaiting_approval",
                    pending_approval_id=APPROVAL_ID,
                    pending_proposal_hash=PENDING_HASH,
                )
            )

    def test_pending_proposal_hash_is_only_valid_while_waiting(self):
        with self.assertRaisesRegex(ContractError, "only while awaiting"):
            validate_agent_state(self.valid_state(pending_proposal_hash=PENDING_HASH))

    def test_accepts_owner_bound_approval_resume(self):
        state = self.valid_waiting_state()
        approval = self.valid_approval()
        result = validate_approval_resume(
            state,
            approval,
            OWNER_ID,
            datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
        )
        self.assertEqual(result.approval_id, APPROVAL_ID)
        self.assertEqual(result.thread_id, THREAD_ID)
        self.assertEqual(result.proposal_hash, PENDING_HASH)
        self.assertEqual(result.policy_version, APPROVAL_POLICY_VERSION)
        self.assertFalse(hasattr(result, "owner_id"))

    def test_rejects_approval_resume_for_different_owner(self):
        with self.assertRaisesRegex(ContractError, "owner does not match"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(),
                "77777777-7777-4777-8777-777777777777",
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_approval_resume_for_different_thread(self):
        with self.assertRaisesRegex(ContractError, "thread does not match"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(thread_id="77777777-7777-4777-8777-777777777777"),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_approval_id_not_pending_in_checkpoint(self):
        with self.assertRaisesRegex(ContractError, "id does not match"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(approval_id="77777777-7777-4777-8777-777777777777"),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_tampered_proposal_hash(self):
        with self.assertRaisesRegex(ContractError, "hash does not match"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(proposal_hash="b" * 64),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_stale_approval_policy_version(self):
        with self.assertRaisesRegex(ContractError, "policy version does not match"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(policy_version="nova-approval.v0"),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_pending_rejected_or_edited_approval(self):
        for status in ("pending", "rejected", "edited", "expired"):
            with self.subTest(status=status):
                with self.assertRaisesRegex(ContractError, "not approved"):
                    validate_approval_resume(
                        self.valid_waiting_state(),
                        self.valid_approval(status=status),
                        OWNER_ID,
                        datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
                    )

    def test_rejects_approval_expired_before_resume(self):
        with self.assertRaisesRegex(ContractError, "expired"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(expires_at="2026-10-31T01:40:00+07:00"),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_approval_without_decision_timestamp(self):
        with self.assertRaisesRegex(ContractError, "missing decided_at"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(decided_at=None),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_future_approval_decision_timestamp(self):
        with self.assertRaisesRegex(ContractError, "future"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(decided_at="2026-10-31T01:50:00+07:00"),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_naive_resume_clock(self):
        with self.assertRaisesRegex(ContractError, "resume time must include a timezone"):
            validate_approval_resume(
                self.valid_waiting_state(),
                self.valid_approval(),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00"),
            )

    def test_rejects_resume_when_run_is_not_waiting(self):
        with self.assertRaisesRegex(ContractError, "not awaiting approval"):
            validate_approval_resume(
                self.valid_state(),
                self.valid_approval(),
                OWNER_ID,
                datetime.fromisoformat("2026-10-31T01:45:00+07:00"),
            )

    def test_rejects_checkpoint_tool_call_with_sensitive_arguments(self):
        call = ToolCall(
            "get_market_quotes",
            CALL_ID,
            IDEMPOTENCY_KEY,
            {"symbol": "XAUUSDm", "apiKey": "do-not-checkpoint"},
        )
        with self.assertRaisesRegex(ContractError, "server-owned or sensitive"):
            validate_agent_state(self.valid_state(tool_calls=(call,)))

    def test_rejects_forbidden_tool_in_checkpoint(self):
        call = ToolCall("execute_broker_order", CALL_ID, IDEMPOTENCY_KEY, {})
        with self.assertRaisesRegex(ContractError, "forbidden tool"):
            validate_agent_state(self.valid_state(tool_calls=(call,)))

    def test_rejects_updated_at_before_created_at(self):
        with self.assertRaisesRegex(ContractError, "cannot precede"):
            validate_agent_state(
                self.valid_state(updated_at="2026-10-30T01:00:00+07:00")
            )

    def test_rejects_wrong_state_schema(self):
        with self.assertRaisesRegex(ContractError, "schema version"):
            validate_agent_state(self.valid_state(schema_version="nova.agent-state.v0"))

    def test_rejects_non_uuid_thread_id(self):
        with self.assertRaisesRegex(ContractError, "thread_id"):
            validate_agent_state(self.valid_state(thread_id="thread-1"))


if __name__ == "__main__":
    unittest.main()
