"""Server-validated Team Lead contracts for NOVA multi-team orchestration.

No model payload is trusted for actor/tenant identity, team membership or capability
assignment. Those values are resolved by the authenticated Hub adapter and the
server-owned team registry. This module validates contracts only; it executes no
agents, tools, workflows, or external side effects.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Sequence

from .contracts import ContractError

TEAM_LEAD_SCHEMA = "nova.team-lead-task.v1"
MAX_TEAM_STEPS = 20
MAX_TEAM_TOOL_CALLS = 12
MAX_TEAM_TIMEOUT_MS = 120_000
MAX_TEAM_INPUT_BYTES = 65_536
MAX_TEAM_OUTPUT_BYTES = 32_768
MAX_TEAM_REFS = 32
_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")
_REF_RE = re.compile(r"^[a-z][a-z0-9_.:-]{1,127}$")


@dataclass(frozen=True)
class TeamDefinition:
    """Trusted, server-owned registration for one Team Lead and its specialists."""

    team_id: str
    lead_agent_ref: str
    specialist_agent_refs: tuple[str, ...]
    allowed_capability_refs: tuple[str, ...]


@dataclass(frozen=True)
class TeamTaskBudget:
    max_steps: int = 20
    max_tool_calls: int = 12
    timeout_ms: int = 120_000
    max_input_bytes: int = 65_536
    max_output_bytes: int = 32_768


@dataclass(frozen=True)
class TeamLeadTask:
    """Untrusted task proposal; identity and tenant scope are deliberately absent."""

    schema_version: str
    task_id: str
    parent_task_id: str | None
    team_id: str
    lead_agent_ref: str
    goal: str
    allowed_capabilities: tuple[str, ...]
    input_refs: tuple[str, ...]
    acceptance_criteria: tuple[str, ...]
    budget: TeamTaskBudget = TeamTaskBudget()


@dataclass(frozen=True)
class TeamTaskAuthorization:
    """Server-derived NOVA Hub context; never deserialize from model-generated data."""

    task_id: str
    actor_ref: str
    owner_ref: str
    capability_ceiling: frozenset[str]
    allowed_input_refs: frozenset[str]
    deadline: datetime
    budget_ceiling: TeamTaskBudget
    tenant_ref: str | None = None


def _uuid(value: str, field_name: str) -> None:
    if not isinstance(value, str):
        raise ContractError(f"{field_name} must be a UUID")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ContractError(f"{field_name} must be a UUID") from exc
    if str(parsed) != value.lower():
        raise ContractError(f"{field_name} must use canonical UUID format")


def _ref(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not _REF_RE.fullmatch(value):
        raise ContractError(f"{field_name} must be a registered reference")


def _budget(value: TeamTaskBudget, ceiling: TeamTaskBudget) -> None:
    if not isinstance(value, TeamTaskBudget) or not isinstance(ceiling, TeamTaskBudget):
        raise ContractError("budget and authorized budget ceiling are required")
    limits = (
        ("max_steps", MAX_TEAM_STEPS),
        ("max_tool_calls", MAX_TEAM_TOOL_CALLS),
        ("timeout_ms", MAX_TEAM_TIMEOUT_MS),
        ("max_input_bytes", MAX_TEAM_INPUT_BYTES),
        ("max_output_bytes", MAX_TEAM_OUTPUT_BYTES),
    )
    for field_name, hard_limit in limits:
        item = getattr(value, field_name)
        parent_limit = getattr(ceiling, field_name)
        if isinstance(item, bool) or not isinstance(item, int) or item < 1:
            raise ContractError(f"budget.{field_name} must be a positive integer")
        if isinstance(parent_limit, bool) or not isinstance(parent_limit, int) or parent_limit < 1:
            raise ContractError(f"authorized budget ceiling {field_name} is invalid")
        if item > hard_limit or item > parent_limit:
            raise ContractError(f"budget.{field_name} exceeds the authorized ceiling")


def validate_team_registry(
    definitions: Sequence[TeamDefinition],
) -> dict[str, TeamDefinition]:
    if not isinstance(definitions, Sequence) or isinstance(definitions, (str, bytes)):
        raise ContractError("team registry must be a sequence")
    registry: dict[str, TeamDefinition] = {}
    for definition in definitions:
        if not isinstance(definition, TeamDefinition):
            raise ContractError("team registry contains an invalid definition")
        if not isinstance(definition.team_id, str) or not _ID_RE.fullmatch(definition.team_id):
            raise ContractError("team_id is invalid")
        _ref(definition.lead_agent_ref, "lead_agent_ref")
        if definition.team_id in registry:
            raise ContractError("duplicate team_id")
        if not isinstance(definition.specialist_agent_refs, tuple):
            raise ContractError("specialist_agent_refs must be a tuple")
        if not isinstance(definition.allowed_capability_refs, tuple):
            raise ContractError("allowed_capability_refs must be a tuple")
        for ref in definition.specialist_agent_refs:
            _ref(ref, "specialist_agent_ref")
        for ref in definition.allowed_capability_refs:
            _ref(ref, "allowed_capability_ref")
        if len(set(definition.specialist_agent_refs)) != len(definition.specialist_agent_refs):
            raise ContractError("duplicate specialist agent")
        if definition.lead_agent_ref in definition.specialist_agent_refs:
            raise ContractError("team lead cannot also be registered as a specialist")
        if len(set(definition.allowed_capability_refs)) != len(definition.allowed_capability_refs):
            raise ContractError("duplicate team capability")
        registry[definition.team_id] = definition
    return registry


def validate_team_lead_task(
    task: TeamLeadTask,
    *,
    team_registry: Mapping[str, TeamDefinition],
    authorization: TeamTaskAuthorization,
    parent_authorization: TeamTaskAuthorization | None = None,
) -> TeamLeadTask:
    """Validate against trusted registry and Hub-derived authorization.

    Child tasks must remain within the parent tenant, capability, resource, deadline
    and remaining-budget envelope. Tenant/actor refs never come from task payloads.
    """
    if not isinstance(task, TeamLeadTask):
        raise ContractError("task must be a TeamLeadTask")
    if task.schema_version != TEAM_LEAD_SCHEMA:
        raise ContractError("unsupported Team Lead task schema")
    _uuid(task.task_id, "task_id")
    if task.parent_task_id is not None:
        _uuid(task.parent_task_id, "parent_task_id")
    if not isinstance(task.team_id, str) or not _ID_RE.fullmatch(task.team_id):
        raise ContractError("team_id is invalid")
    if not isinstance(team_registry, Mapping):
        raise ContractError("server-owned team registry is required")
    team = team_registry.get(task.team_id)
    if team is None:
        raise ContractError("team is not registered")
    if task.lead_agent_ref != team.lead_agent_ref:
        raise ContractError("lead agent does not match the server-owned team registry")
    if not isinstance(task.goal, str) or not task.goal.strip() or len(task.goal) > 1_000:
        raise ContractError("goal must be a bounded non-empty string")
    for name, refs in (
        ("allowed_capabilities", task.allowed_capabilities),
        ("input_refs", task.input_refs),
        ("acceptance_criteria", task.acceptance_criteria),
    ):
        if not isinstance(refs, tuple) or len(refs) > MAX_TEAM_REFS:
            raise ContractError(f"{name} must be a bounded tuple")
        if name == "acceptance_criteria":
            if any(not isinstance(x, str) or not x.strip() or len(x) > 500 for x in refs):
                raise ContractError("acceptance criteria must be bounded non-empty strings")
        else:
            for ref in refs:
                _ref(ref, name)
            if len(set(refs)) != len(refs):
                raise ContractError(f"{name} contains duplicate refs")

    if not isinstance(authorization, TeamTaskAuthorization):
        raise ContractError("Hub authorization context is required")
    _uuid(authorization.task_id, "Hub task_id")
    _ref(authorization.actor_ref, "actor_ref")
    _ref(authorization.owner_ref, "owner_ref")
    if authorization.tenant_ref is not None:
        _ref(authorization.tenant_ref, "tenant_ref")
    if authorization.task_id != task.task_id:
        raise ContractError("Hub authorization task binding mismatch")
    if not isinstance(authorization.capability_ceiling, frozenset):
        raise ContractError("Hub capability ceiling must be server-owned")
    if not isinstance(authorization.allowed_input_refs, frozenset):
        raise ContractError("Hub input allowlist must be server-owned")
    if not isinstance(authorization.deadline, datetime) or authorization.deadline.tzinfo is None:
        raise ContractError("Hub deadline must be timezone-aware")
    if not set(task.allowed_capabilities).issubset(set(team.allowed_capability_refs)):
        raise ContractError("task requests a capability not assigned to this team")
    if not set(task.allowed_capabilities).issubset(authorization.capability_ceiling):
        raise ContractError("task exceeds the initiating user's capability ceiling")
    if not set(task.input_refs).issubset(authorization.allowed_input_refs):
        raise ContractError("task references an unauthorized input resource")
    _budget(task.budget, authorization.budget_ceiling)

    if parent_authorization is None:
        if task.parent_task_id is not None:
            raise ContractError("child task requires parent authorization context")
    else:
        if not isinstance(parent_authorization, TeamTaskAuthorization):
            raise ContractError("parent authorization context is invalid")
        if task.parent_task_id is None or task.parent_task_id != parent_authorization.task_id:
            raise ContractError("delegated child task must bind to its parent task")
        if authorization.owner_ref != parent_authorization.owner_ref:
            raise ContractError("child task cannot change owner scope")
        if authorization.tenant_ref != parent_authorization.tenant_ref:
            raise ContractError("child task cannot change tenant scope")
        if not authorization.capability_ceiling.issubset(parent_authorization.capability_ceiling):
            raise ContractError("child task cannot widen parent capabilities")
        if not authorization.allowed_input_refs.issubset(parent_authorization.allowed_input_refs):
            raise ContractError("child task cannot widen parent input resources")
        if authorization.deadline > parent_authorization.deadline:
            raise ContractError("child task cannot extend parent deadline")
        _budget(task.budget, parent_authorization.budget_ceiling)
    return task


INITIAL_TEAM_IDS = (
    "research",
    "engineering",
    "review",
    "qa_test",
    "knowledge_learning",
    "optimization",
    "security",
    "delivery_coordinator",
)
