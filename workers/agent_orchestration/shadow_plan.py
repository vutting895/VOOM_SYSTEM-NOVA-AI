"""Pure, synthetic-only Team Lead delegation planning.

This module creates an in-memory shadow plan. It does not persist tasks, execute
agents/tools, schedule work, access customer records, or perform external I/O.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .contracts import ContractError
from .team_leads import (
    TeamDefinition,
    TeamLeadTask,
    TeamTaskAuthorization,
    TeamTaskBudget,
    validate_team_lead_task,
    validate_team_registry,
)

TEAM_SHADOW_PLAN_SCHEMA = "nova.team-shadow-plan.v1"
SHADOW_ONLY_TEAMS = frozenset({"research", "engineering", "review", "qa_test"})


@dataclass(frozen=True)
class ShadowChildProposal:
    task: TeamLeadTask
    authorization: TeamTaskAuthorization


@dataclass(frozen=True)
class ShadowDelegationPlan:
    schema_version: str
    mode: str
    parent_task_id: str
    children: tuple[TeamLeadTask, ...]
    reserved_budget: TeamTaskBudget
    execution_enabled: bool = False
    persistence_enabled: bool = False
    external_io_enabled: bool = False
    customer_data_enabled: bool = False


def _sum_child_budgets(children: Sequence[ShadowChildProposal]) -> TeamTaskBudget:
    fields = (
        "max_steps",
        "max_tool_calls",
        "timeout_ms",
        "max_input_bytes",
        "max_output_bytes",
    )
    totals = {name: sum(getattr(child.task.budget, name) for child in children) for name in fields}
    return TeamTaskBudget(**totals)


def build_shadow_delegation_plan(
    parent_task: TeamLeadTask,
    *,
    parent_authorization: TeamTaskAuthorization,
    child_proposals: tuple[ShadowChildProposal, ...],
    team_registry: Mapping[str, TeamDefinition],
) -> ShadowDelegationPlan:
    """Validate a coordinator's complete four-team shadow plan without side effects."""
    if not isinstance(child_proposals, tuple) or len(child_proposals) != len(SHADOW_ONLY_TEAMS):
        raise ContractError("shadow plan requires exactly four child team proposals")
    if not isinstance(team_registry, Mapping):
        raise ContractError("server-owned team registry is required")

    registry = validate_team_registry(tuple(team_registry.values()))
    if set(registry) != set(team_registry):
        raise ContractError("team registry keys must match registered team IDs")
    if parent_task.team_id != "delivery_coordinator":
        raise ContractError("shadow plan parent must be the delivery coordinator")
    if any(not ref.startswith("synthetic.") for ref in parent_task.input_refs):
        raise ContractError("shadow plan accepts synthetic fixture references only")
    validate_team_lead_task(
        parent_task,
        team_registry=registry,
        authorization=parent_authorization,
    )

    team_ids = tuple(child.task.team_id for child in child_proposals)
    if set(team_ids) != SHADOW_ONLY_TEAMS or len(set(team_ids)) != len(team_ids):
        raise ContractError("shadow plan must contain research, engineering, review and qa_test exactly once")

    task_ids = tuple(child.task.task_id for child in child_proposals)
    if len(set(task_ids)) != len(task_ids) or parent_task.task_id in task_ids:
        raise ContractError("shadow plan task IDs must be unique and distinct from the parent")

    lead_refs = (parent_task.lead_agent_ref,) + tuple(
        child.task.lead_agent_ref for child in child_proposals
    )
    if len(set(lead_refs)) != len(lead_refs):
        raise ContractError("coordinator, engineering, review and QA leads must be independent")

    for child in child_proposals:
        validate_team_lead_task(
            child.task,
            team_registry=registry,
            authorization=child.authorization,
            parent_authorization=parent_authorization,
        )
        if child.authorization.actor_ref != parent_authorization.actor_ref:
            raise ContractError("child task cannot change initiating actor")
        if not set(child.task.input_refs).issubset(set(parent_task.input_refs)):
            raise ContractError("child task input must be included in the parent task scope")

    reserved = _sum_child_budgets(child_proposals)
    for field in (
        "max_steps",
        "max_tool_calls",
        "timeout_ms",
        "max_input_bytes",
        "max_output_bytes",
    ):
        if getattr(reserved, field) > getattr(parent_task.budget, field):
            raise ContractError(f"aggregate child budget.{field} exceeds the parent task budget")

    return ShadowDelegationPlan(
        schema_version=TEAM_SHADOW_PLAN_SCHEMA,
        mode="shadow_only",
        parent_task_id=parent_task.task_id,
        children=tuple(child.task for child in child_proposals),
        reserved_budget=reserved,
    )
