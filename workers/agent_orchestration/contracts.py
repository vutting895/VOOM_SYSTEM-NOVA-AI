"""Strict, dependency-free contracts for NOVA's future agent workflow.

This module deliberately does not import LangGraph, call an LLM, access a broker,
load credentials, or execute tools. It validates the boundary between a future
workflow runtime and application-owned services.
"""
from __future__ import annotations

import json
import math
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Mapping, Sequence

AGENT_STATE_SCHEMA = "nova.agent-state.v1"
MAX_AGENT_STEPS = 12
MAX_TOOL_TIMEOUT_SECONDS = 20
MAX_TOOL_RETRIES = 2
MAX_TOOL_ARGUMENT_BYTES = 8_192
MAX_TOOL_CALLS_IN_CHECKPOINT = 24

ToolEffect = Literal["none", "draft_write", "external_write", "broker_write"]
ApprovalMode = Literal["none", "human_review"]
RunStatus = Literal[
    "queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"
]

# These operations are intentionally not part of NOVA's autonomous v1 tool set.
_FORBIDDEN_TOOL_NAMES = frozenset(
    {
        "execute_broker_order",
        "place_order",
        "submit_order",
        "modify_order",
        "cancel_order",
        "close_position",
        "modify_position",
        "transfer_funds",
        "withdraw_funds",
        "request_mt5_demo_connection",
    }
)

# Identity, routing and secret material are supplied by the authenticated server
# adapter, never by model-generated tool arguments or checkpoint state.
_FORBIDDEN_ARGUMENT_KEYS = frozenset(
    {
        "user_id",
        "owner_id",
        "tenant_id",
        "connection_id",
        "account_id",
        "thread_id",
        "run_id",
        "request_id",
        "correlation_id",
        "idempotency_key",
        "bridge_route_id",
        "route_id",
        "upstream_url",
        "hostname",
        "host",
        "port",
        "password",
        "passwd",
        "secret",
        "api_key",
        "apikey",
        "access_token",
        "accesstoken",
        "refresh_token",
        "refreshtoken",
        "authorization",
        "credential",
        "credentials",
        "private_key",
        "bearer_token",
    }
)

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")


class ContractError(ValueError):
    """Raised when untrusted workflow or tool data violates a NOVA contract."""


def _require_uuid(value: str, field_name: str) -> None:
    if not isinstance(value, str):
        raise ContractError(f"{field_name} must be a UUID string")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ContractError(f"{field_name} must be a UUID string") from exc
    if str(parsed) != value.lower():
        raise ContractError(f"{field_name} must use canonical UUID format")


def _require_aware_datetime(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{field_name} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError(f"{field_name} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ContractError(f"{field_name} must include a timezone")


def _validate_json_value(value: Any, *, path: str = "arguments", depth: int = 0) -> None:
    if depth > 8:
        raise ContractError(f"{path} exceeds maximum nesting depth")
    if value is None or isinstance(value, (str, bool, int)):
        if isinstance(value, str) and len(value) > 4_096:
            raise ContractError(f"{path} contains an oversized string")
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractError(f"{path} contains a non-finite number")
        return
    if isinstance(value, list):
        if len(value) > 100:
            raise ContractError(f"{path} contains too many array items")
        for index, item in enumerate(value):
            _validate_json_value(item, path=f"{path}[{index}]", depth=depth + 1)
        return
    if isinstance(value, Mapping):
        if len(value) > 100:
            raise ContractError(f"{path} contains too many object fields")
        for key, item in value.items():
            if not isinstance(key, str) or not key:
                raise ContractError(f"{path} contains an invalid object key")
            snake_key = re.sub(r"(?<!^)(?=[A-Z])", "_", key.strip())
            normalized_key = snake_key.lower().replace("-", "_")
            if normalized_key in _FORBIDDEN_ARGUMENT_KEYS:
                raise ContractError(f"{path}.{key} is server-owned or sensitive")
            _validate_json_value(item, path=f"{path}.{key}", depth=depth + 1)
        return
    raise ContractError(f"{path} contains a non-JSON value")


def _bounded_json_bytes(value: Any, *, limit: int, field_name: str) -> None:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, OverflowError) as exc:
        raise ContractError(f"{field_name} must be finite JSON data") from exc
    if len(encoded) > limit:
        raise ContractError(f"{field_name} exceeds {limit} bytes")


@dataclass(frozen=True)
class ToolContract:
    """Application-owned policy for one named tool; the model cannot define this."""

    name: str
    version: str
    side_effect: ToolEffect = "none"
    approval_mode: ApprovalMode = "none"
    timeout_seconds: int = 10
    max_retries: int = 0
    idempotent: bool = True


@dataclass(frozen=True)
class ToolCall:
    """One bounded tool request with an application-generated idempotency key."""

    tool_name: str
    call_id: str
    idempotency_key: str
    arguments: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentRunState:
    """Minimal checkpoint-safe workflow state; no transcript or principal secrets."""

    schema_version: str
    run_id: str
    thread_id: str
    intent: str
    status: RunStatus
    step_count: int
    max_steps: int
    policy_version: str
    created_at: str
    updated_at: str
    pending_approval_id: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()


def validate_tool_contract(contract: ToolContract) -> ToolContract:
    if not isinstance(contract, ToolContract):
        raise ContractError("tool contract must be a ToolContract")
    if not isinstance(contract.name, str) or not _NAME_RE.fullmatch(contract.name):
        raise ContractError("tool name must be lowercase snake_case")
    if contract.name in _FORBIDDEN_TOOL_NAMES:
        raise ContractError("tool is explicitly forbidden in NOVA v1")
    if not isinstance(contract.version, str) or not re.fullmatch(r"v[1-9][0-9]*", contract.version):
        raise ContractError("tool version must use vN format")
    if not isinstance(contract.side_effect, str) or contract.side_effect not in ("none", "draft_write", "external_write", "broker_write"):
        raise ContractError("unsupported tool side_effect")
    if not isinstance(contract.approval_mode, str) or contract.approval_mode not in ("none", "human_review"):
        raise ContractError("unsupported approval_mode")
    if contract.side_effect in ("external_write", "broker_write"):
        raise ContractError("external and broker writes are disabled in NOVA v1")
    if contract.side_effect == "none" and contract.approval_mode != "none":
        raise ContractError("read-only tools must not request approval")
    if contract.side_effect == "draft_write" and contract.approval_mode != "human_review":
        raise ContractError("draft writes require human review")
    if isinstance(contract.timeout_seconds, bool) or not isinstance(contract.timeout_seconds, int):
        raise ContractError("timeout_seconds must be an integer")
    if not 1 <= contract.timeout_seconds <= MAX_TOOL_TIMEOUT_SECONDS:
        raise ContractError("timeout_seconds is outside the allowed range")
    if isinstance(contract.max_retries, bool) or not isinstance(contract.max_retries, int):
        raise ContractError("max_retries must be an integer")
    if not 0 <= contract.max_retries <= MAX_TOOL_RETRIES:
        raise ContractError("max_retries is outside the allowed range")
    if not isinstance(contract.idempotent, bool):
        raise ContractError("idempotent must be boolean")
    if not contract.idempotent and contract.max_retries:
        raise ContractError("non-idempotent tools cannot be retried")
    return contract


def validate_tool_registry(contracts: Sequence[ToolContract]) -> dict[str, ToolContract]:
    if not isinstance(contracts, Sequence) or isinstance(contracts, (str, bytes)):
        raise ContractError("tool registry must be a sequence of contracts")
    registry: dict[str, ToolContract] = {}
    for contract in contracts:
        validate_tool_contract(contract)
        if contract.name in registry:
            raise ContractError(f"duplicate tool contract: {contract.name}")
        registry[contract.name] = contract
    return registry


def validate_tool_call(call: ToolCall, registry: Mapping[str, ToolContract]) -> ToolCall:
    if not isinstance(call, ToolCall):
        raise ContractError("tool call must be a ToolCall")
    if not isinstance(registry, Mapping):
        raise ContractError("tool registry must be a mapping")
    if not isinstance(call.tool_name, str):
        raise ContractError("tool_name must be a string")
    contract = registry.get(call.tool_name)
    if contract is None:
        raise ContractError("tool is not in the server-owned allowlist")
    validate_tool_contract(contract)
    _require_uuid(call.call_id, "call_id")
    _require_uuid(call.idempotency_key, "idempotency_key")
    if not isinstance(call.arguments, Mapping):
        raise ContractError("tool arguments must be a JSON object")
    _validate_json_value(call.arguments)
    _bounded_json_bytes(call.arguments, limit=MAX_TOOL_ARGUMENT_BYTES, field_name="tool arguments")
    return call


def validate_agent_state(state: AgentRunState) -> AgentRunState:
    if not isinstance(state, AgentRunState):
        raise ContractError("state must be an AgentRunState")
    if state.schema_version != AGENT_STATE_SCHEMA:
        raise ContractError("unsupported agent state schema version")
    _require_uuid(state.run_id, "run_id")
    _require_uuid(state.thread_id, "thread_id")
    if not isinstance(state.intent, str) or not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", state.intent):
        raise ContractError("intent must be a supported-style identifier")
    if state.status not in ("queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"):
        raise ContractError("unsupported run status")
    if isinstance(state.step_count, bool) or not isinstance(state.step_count, int):
        raise ContractError("step_count must be an integer")
    if isinstance(state.max_steps, bool) or not isinstance(state.max_steps, int):
        raise ContractError("max_steps must be an integer")
    if not 0 <= state.step_count <= state.max_steps <= MAX_AGENT_STEPS:
        raise ContractError("run step budget is invalid or exceeded")
    if not isinstance(state.policy_version, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", state.policy_version):
        raise ContractError("policy_version is invalid")
    _require_aware_datetime(state.created_at, "created_at")
    _require_aware_datetime(state.updated_at, "updated_at")
    created_at = datetime.fromisoformat(state.created_at.replace("Z", "+00:00"))
    updated_at = datetime.fromisoformat(state.updated_at.replace("Z", "+00:00"))
    if updated_at < created_at:
        raise ContractError("updated_at cannot precede created_at")
    if state.pending_approval_id is not None:
        _require_uuid(state.pending_approval_id, "pending_approval_id")
    if state.status == "awaiting_approval" and state.pending_approval_id is None:
        raise ContractError("awaiting_approval state requires pending_approval_id")
    if state.status != "awaiting_approval" and state.pending_approval_id is not None:
        raise ContractError("pending_approval_id is valid only while awaiting approval")
    if not isinstance(state.tool_calls, (tuple, list)):
        raise ContractError("tool_calls must be a sequence")
    if len(state.tool_calls) > MAX_TOOL_CALLS_IN_CHECKPOINT:
        raise ContractError("checkpoint contains too many tool calls")
    for call in state.tool_calls:
        if not isinstance(call, ToolCall):
            raise ContractError("checkpoint contains an invalid tool call")
        _require_uuid(call.call_id, "tool_call.call_id")
        _require_uuid(call.idempotency_key, "tool_call.idempotency_key")
        if not isinstance(call.tool_name, str) or not _NAME_RE.fullmatch(call.tool_name):
            raise ContractError("checkpoint contains an invalid tool name")
        if call.tool_name in _FORBIDDEN_TOOL_NAMES:
            raise ContractError("checkpoint contains a forbidden tool")
        if not isinstance(call.arguments, Mapping):
            raise ContractError("checkpoint tool arguments must be an object")
        _validate_json_value(call.arguments, path="checkpoint.tool_calls.arguments")
    _bounded_json_bytes(
        [
            {
                "tool_name": call.tool_name,
                "call_id": call.call_id,
                "idempotency_key": call.idempotency_key,
                "arguments": dict(call.arguments),
            }
            for call in state.tool_calls
        ],
        limit=MAX_TOOL_ARGUMENT_BYTES * 2,
        field_name="checkpoint tool call data",
    )
    # Identity, tenant, credentials, message transcript and raw provider payloads
    # are intentionally not fields of this checkpoint contract.
    return state
