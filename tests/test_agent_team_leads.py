import unittest
from datetime import datetime, timezone

from workers.agent_orchestration.contracts import ContractError
from workers.agent_orchestration.team_leads import (
    TEAM_LEAD_SCHEMA,
    TeamDefinition,
    TeamLeadTask,
    TeamTaskAuthorization,
    TeamTaskBudget,
    validate_team_lead_task,
    validate_team_registry,
)

TASK_ID = "11111111-1111-4111-8111-111111111111"
PARENT_ID = "22222222-2222-4222-8222-222222222222"
DEADLINE = datetime(2026, 11, 1, tzinfo=timezone.utc)


class TeamLeadContractTests(unittest.TestCase):
    def setUp(self):
        self.registry = validate_team_registry([
            TeamDefinition(
                team_id="research",
                lead_agent_ref="agent.research_lead",
                specialist_agent_refs=("agent.web_researcher", "agent.source_verifier"),
                allowed_capability_refs=("capability.research_read", "capability.evidence_write"),
            )
        ])
        self.auth = TeamTaskAuthorization(
            task_id=TASK_ID,
            actor_ref="actor.user_123",
            tenant_ref="tenant.tenant_123",
            capability_ceiling=frozenset({"capability.research_read"}),
            allowed_input_refs=frozenset({"evidence.source_1"}),
            deadline=DEADLINE,
            budget_ceiling=TeamTaskBudget(),
        )

    def task(self, **overrides):
        values = {
            "schema_version": TEAM_LEAD_SCHEMA,
            "task_id": TASK_ID,
            "parent_task_id": None,
            "team_id": "research",
            "lead_agent_ref": "agent.research_lead",
            "goal": "Compare primary sources for a bounded research question",
            "allowed_capabilities": ("capability.research_read",),
            "input_refs": ("evidence.source_1",),
            "acceptance_criteria": ("Return a cited research brief",),
            "budget": TeamTaskBudget(max_steps=5, max_tool_calls=4),
        }
        values.update(overrides)
        return TeamLeadTask(**values)

    def test_accepts_registered_lead_with_hub_authorized_capabilities(self):
        task = self.task()
        self.assertIs(validate_team_lead_task(
            task, team_registry=self.registry, authorization=self.auth
        ), task)

    def test_rejects_unregistered_team(self):
        with self.assertRaisesRegex(ContractError, "not registered"):
            validate_team_lead_task(
                self.task(team_id="unknown"), team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_model_supplied_lead_not_matching_registry(self):
        with self.assertRaisesRegex(ContractError, "server-owned team registry"):
            validate_team_lead_task(
                self.task(lead_agent_ref="agent.root_admin"),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_capability_outside_team_assignment(self):
        with self.assertRaisesRegex(ContractError, "not assigned"):
            validate_team_lead_task(
                self.task(allowed_capabilities=("capability.admin",)),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_capability_outside_user_authorization(self):
        with self.assertRaisesRegex(ContractError, "user's capability ceiling"):
            validate_team_lead_task(
                self.task(allowed_capabilities=("capability.evidence_write",)),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_foreign_input_reference(self):
        with self.assertRaisesRegex(ContractError, "unauthorized input"):
            validate_team_lead_task(
                self.task(input_refs=("evidence.foreign_tenant",)),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_budget_above_server_ceiling(self):
        with self.assertRaisesRegex(ContractError, "exceeds the authorized ceiling"):
            validate_team_lead_task(
                self.task(budget=TeamTaskBudget(max_steps=21)),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_child_task_without_parent_context(self):
        with self.assertRaisesRegex(ContractError, "requires parent authorization"):
            validate_team_lead_task(
                self.task(parent_task_id=PARENT_ID),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_child_tenant_escalation(self):
        child_auth = TeamTaskAuthorization(
            task_id=TASK_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref="tenant.foreign",
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        parent_auth = TeamTaskAuthorization(
            task_id=PARENT_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        with self.assertRaisesRegex(ContractError, "cannot change tenant"):
            validate_team_lead_task(
                self.task(parent_task_id=PARENT_ID),
                team_registry=self.registry, authorization=child_auth,
                parent_authorization=parent_auth,
            )

    def test_rejects_child_capability_escalation(self):
        child_auth = TeamTaskAuthorization(
            task_id=TASK_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=frozenset({"capability.research_read", "capability.admin"}),
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        parent_auth = TeamTaskAuthorization(
            task_id=PARENT_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        with self.assertRaisesRegex(ContractError, "cannot widen parent capabilities"):
            validate_team_lead_task(
                self.task(parent_task_id=PARENT_ID),
                team_registry=self.registry, authorization=child_auth,
                parent_authorization=parent_auth,
            )

    def test_rejects_child_deadline_extension(self):
        child_auth = TeamTaskAuthorization(
            task_id=TASK_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=datetime(2026, 11, 2, tzinfo=timezone.utc),
            budget_ceiling=self.auth.budget_ceiling,
        )
        parent_auth = TeamTaskAuthorization(
            task_id=PARENT_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        with self.assertRaisesRegex(ContractError, "cannot extend parent deadline"):
            validate_team_lead_task(
                self.task(parent_task_id=PARENT_ID),
                team_registry=self.registry, authorization=child_auth,
                parent_authorization=parent_auth,
            )

    def test_rejects_child_parent_task_id_mismatch(self):
        parent_auth = TeamTaskAuthorization(
            task_id=PARENT_ID,
            actor_ref=self.auth.actor_ref,
            tenant_ref=self.auth.tenant_ref,
            capability_ceiling=self.auth.capability_ceiling,
            allowed_input_refs=self.auth.allowed_input_refs,
            deadline=self.auth.deadline,
            budget_ceiling=self.auth.budget_ceiling,
        )
        with self.assertRaisesRegex(ContractError, "must bind to its parent"):
            validate_team_lead_task(
                self.task(parent_task_id=TASK_ID),
                team_registry=self.registry, authorization=self.auth,
                parent_authorization=parent_auth,
            )

    def test_rejects_unknown_schema(self):
        with self.assertRaisesRegex(ContractError, "schema"):
            validate_team_lead_task(
                self.task(schema_version="nova.team-lead-task.v9"),
                team_registry=self.registry, authorization=self.auth
            )

    def test_rejects_missing_server_context(self):
        with self.assertRaisesRegex(ContractError, "Hub authorization"):
            validate_team_lead_task(
                self.task(), team_registry=self.registry, authorization=None
            )


if __name__ == "__main__":
    unittest.main()
