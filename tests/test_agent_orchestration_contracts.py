import unittest

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
        state = self.valid_state(status="awaiting_approval", pending_approval_id=APPROVAL_ID)
        self.assertEqual(validate_agent_state(state), state)

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
