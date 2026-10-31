import unittest
from dataclasses import replace
from datetime import datetime, timezone

from workers.agent_orchestration.contracts import ContractError
from workers.agent_orchestration.team_leads import (
    TEAM_LEAD_SCHEMA,
    TeamDefinition,
    TeamLeadTask,
    TeamTaskAuthorization,
    TeamTaskBudget,
    validate_team_registry,
)
from workers.agent_orchestration.shadow_plan import (
    TEAM_SHADOW_PLAN_SCHEMA,
    ShadowChildProposal,
    build_shadow_delegation_plan,
)

PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CHILD_IDS = {
    "research": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "engineering": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "review": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "qa_test": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
}
DEADLINE = datetime(2026, 11, 1, tzinfo=timezone.utc)
PARENT_BUDGET = TeamTaskBudget()
CHILD_BUDGET = TeamTaskBudget(
    max_steps=5,
    max_tool_calls=3,
    timeout_ms=30_000,
    max_input_bytes=16_384,
    max_output_bytes=8_192,
)
CAPS = {
    "research": "capability.research_read",
    "engineering": "capability.engineering_plan",
    "review": "capability.review_read",
    "qa_test": "capability.qa_plan",
}
INPUTS = {
    "research": "evidence.research_1",
    "engineering": "repo.snapshot_1",
    "review": "repo.diff_1",
    "qa_test": "test.fixture_1",
}


class TeamLeadShadowPlanTests(unittest.TestCase):
    def setUp(self):
        self.definitions = [
            TeamDefinition(
                team_id="delivery_coordinator",
                lead_agent_ref="agent.delivery_coordinator",
                specialist_agent_refs=("agent.planner",),
                allowed_capability_refs=(
                    "capability.coordinate",
                    *CAPS.values(),
                ),
            ),
            TeamDefinition(
                team_id="research",
                lead_agent_ref="agent.research_lead",
                specialist_agent_refs=("agent.researcher",),
                allowed_capability_refs=(CAPS["research"],),
            ),
            TeamDefinition(
                team_id="engineering",
                lead_agent_ref="agent.engineering_lead",
                specialist_agent_refs=("agent.engineer",),
                allowed_capability_refs=(CAPS["engineering"],),
            ),
            TeamDefinition(
                team_id="review",
                lead_agent_ref="agent.review_lead",
                specialist_agent_refs=("agent.reviewer",),
                allowed_capability_refs=(CAPS["review"],),
            ),
            TeamDefinition(
                team_id="qa_test",
                lead_agent_ref="agent.qa_test_lead",
                specialist_agent_refs=("agent.tester",),
                allowed_capability_refs=(CAPS["qa_test"],),
            ),
        ]
        self.registry = validate_team_registry(self.definitions)
        self.parent_auth = TeamTaskAuthorization(
            task_id=PARENT_ID,
            actor_ref="actor.user_123",
            owner_ref="owner.user_123",
            capability_ceiling=frozenset({"capability.coordinate", *CAPS.values()}),
            allowed_input_refs=frozenset(set(INPUTS.values()) | {"evidence.extra"}),
            deadline=DEADLINE,
            budget_ceiling=PARENT_BUDGET,
            tenant_ref=None,
        )
        self.parent_task = TeamLeadTask(
            schema_version=TEAM_LEAD_SCHEMA,
            task_id=PARENT_ID,
            parent_task_id=None,
            team_id="delivery_coordinator",
            lead_agent_ref="agent.delivery_coordinator",
            goal="Create a bounded synthetic delivery plan",
            allowed_capabilities=("capability.coordinate", *CAPS.values()),
            input_refs=tuple(INPUTS.values()),
            acceptance_criteria=("Return a complete four-team plan",),
            budget=PARENT_BUDGET,
        )
        self.children = self._children()

    def _children(self):
        goals = {
            "research": "Prepare a source-backed research brief",
            "engineering": "Prepare a proposed repository implementation",
            "review": "Independently review the proposed change",
            "qa_test": "Define and run synthetic contract checks",
        }
        return tuple(
            ShadowChildProposal(
                task=TeamLeadTask(
                    schema_version=TEAM_LEAD_SCHEMA,
                    task_id=CHILD_IDS[team],
                    parent_task_id=PARENT_ID,
                    team_id=team,
                    lead_agent_ref=self.registry[team].lead_agent_ref,
                    goal=goals[team],
                    allowed_capabilities=(CAPS[team],),
                    input_refs=(INPUTS[team],),
                    acceptance_criteria=(f"{team} evidence packet is complete",),
                    budget=CHILD_BUDGET,
                ),
                authorization=TeamTaskAuthorization(
                    task_id=CHILD_IDS[team],
                    actor_ref="actor.user_123",
                    owner_ref="owner.user_123",
                    capability_ceiling=frozenset({CAPS[team]}),
                    allowed_input_refs=frozenset({INPUTS[team]}),
                    deadline=DEADLINE,
                    budget_ceiling=PARENT_BUDGET,
                    tenant_ref=None,
                ),
            )
            for team in ("research", "engineering", "review", "qa_test")
        )

    def test_accepts_four_team_owner_scoped_shadow_plan(self):
        plan = build_shadow_delegation_plan(
            self.parent_task,
            parent_authorization=self.parent_auth,
            child_proposals=self.children,
            team_registry=self.registry,
        )
        self.assertEqual(plan.schema_version, TEAM_SHADOW_PLAN_SCHEMA)
        self.assertEqual(plan.mode, "shadow_only")
        self.assertEqual(len(plan.children), 4)
        self.assertFalse(plan.execution_enabled)
        self.assertFalse(plan.persistence_enabled)
        self.assertFalse(plan.external_io_enabled)
        self.assertEqual(plan.reserved_budget, PARENT_BUDGET)

    def test_rejects_incomplete_team_plan(self):
        with self.assertRaisesRegex(ContractError, "exactly four"):
            build_shadow_delegation_plan(
                self.parent_task,
                parent_authorization=self.parent_auth,
                child_proposals=self.children[:3],
                team_registry=self.registry,
            )

    def test_rejects_child_input_outside_parent_task_scope(self):
        child = self.children[0]
        changed_task = replace(child.task, input_refs=("evidence.extra",))
        changed_auth = replace(child.authorization, allowed_input_refs=frozenset({"evidence.extra"}))
        proposals = (replace(child, task=changed_task, authorization=changed_auth), *self.children[1:])
        with self.assertRaisesRegex(ContractError, "included in the parent task scope"):
            build_shadow_delegation_plan(
                self.parent_task,
                parent_authorization=self.parent_auth,
                child_proposals=proposals,
                team_registry=self.registry,
            )

    def test_rejects_aggregate_budget_overrun_even_when_each_child_is_individually_valid(self):
        proposals = tuple(
            replace(child, task=replace(child.task, budget=TeamTaskBudget(
                max_steps=6,
                max_tool_calls=3,
                timeout_ms=30_000,
                max_input_bytes=16_384,
                max_output_bytes=8_192,
            )))
            for child in self.children
        )
        with self.assertRaisesRegex(ContractError, "aggregate child budget.max_steps"):
            build_shadow_delegation_plan(
                self.parent_task,
                parent_authorization=self.parent_auth,
                child_proposals=proposals,
                team_registry=self.registry,
            )

    def test_rejects_child_actor_change(self):
        child = self.children[0]
        changed_auth = replace(child.authorization, actor_ref="actor.other_user")
        proposals = (replace(child, authorization=changed_auth), *self.children[1:])
        with self.assertRaisesRegex(ContractError, "initiating actor"):
            build_shadow_delegation_plan(
                self.parent_task,
                parent_authorization=self.parent_auth,
                child_proposals=proposals,
                team_registry=self.registry,
            )

    def test_rejects_shared_engineering_and_review_lead(self):
        definitions = list(self.definitions)
        definitions[3] = replace(
            definitions[3],
            lead_agent_ref="agent.engineering_lead",
        )
        shared_registry = validate_team_registry(definitions)
        proposals = tuple(
            replace(child, task=replace(
                child.task,
                lead_agent_ref=shared_registry[child.task.team_id].lead_agent_ref,
            ))
            for child in self.children
        )
        with self.assertRaisesRegex(ContractError, "must be independent"):
            build_shadow_delegation_plan(
                self.parent_task,
                parent_authorization=self.parent_auth,
                child_proposals=proposals,
                team_registry=shared_registry,
            )


if __name__ == "__main__":
    unittest.main()
