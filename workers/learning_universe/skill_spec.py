"""Declarative, deny-by-default Skill specification validation.

A generated Skill is a typed workflow description that references existing
server-owned tools and registered schemas. It is never executable source code.
"""
from __future__ import annotations

from hashlib import sha256
import json
import re
from typing import Any, Mapping


SKILL_CONTRACT = "nova.skill.v1"
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$")
TASK_INTENTS = frozenset({
    "chat",
    "research",
    "strategy_research",
    "code_assistance",
    "tool_workflow",
    "customer_support",
})
DATA_SCOPES = frozenset({"public_research", "owner_workspace"})
_FORBIDDEN_TOOL_PARTS = (
    "broker", "order", "trade", "execute", "execution", "withdraw",
    "transfer", "credential", "secret", "admin", "delete", "write",
)
_ALLOWED_FIELDS = frozenset({
    "contract",
    "skill_id",
    "version",
    "display_name",
    "description",
    "task_intents",
    "input_schema_ref",
    "output_schema_ref",
    "tool_refs",
    "data_scope",
    "preconditions",
    "postconditions",
    "failure_modes",
    "timeout_ms",
    "max_steps",
    "max_tool_calls",
    "evidence_refs",
    "evaluation_report_ref",
    "policy_version",
    "research_only",
})


class SkillSpecError(ValueError):
    """Raised when a generated Skill specification is invalid."""


def _identifier(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise SkillSpecError(f"{field} must be a bounded opaque identifier")
    return value


def _text(value: Any, field: str, max_length: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise SkillSpecError(f"{field} must be non-empty and at most {max_length} characters")
    if any(ord(char) < 32 for char in value):
        raise SkillSpecError(f"{field} must not contain control characters")
    return value.strip()


def _identifier_list(value: Any, field: str, *, minimum: int, maximum: int) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise SkillSpecError(f"{field} must contain {minimum} to {maximum} entries")
    result = [_identifier(item, field) for item in value]
    if len(set(result)) != len(result):
        raise SkillSpecError(f"{field} must not contain duplicates")
    return result


def validate_skill_spec(
    raw: Mapping[str, Any],
    *,
    allowed_tool_refs: set[str] | frozenset[str],
    registered_schema_refs: set[str] | frozenset[str],
) -> dict[str, Any]:
    """Validate a declarative Skill against trusted server-owned registries.

    The allowlists must be loaded by trusted server code, not copied from the
    generated payload or supplied by the browser/LLM.
    """
    if not isinstance(raw, Mapping):
        raise SkillSpecError("skill specification must be an object")
    unknown = set(raw) - _ALLOWED_FIELDS
    missing = _ALLOWED_FIELDS - set(raw)
    if unknown:
        raise SkillSpecError("unexpected Skill fields: " + ", ".join(sorted(map(str, unknown))))
    if missing:
        raise SkillSpecError("missing Skill fields: " + ", ".join(sorted(missing)))
    if raw["contract"] != SKILL_CONTRACT:
        raise SkillSpecError("unsupported Skill contract")
    if raw["research_only"] is not True:
        raise SkillSpecError("generated Skills must be research_only")
    if not isinstance(raw["version"], str) or not _SEMVER.fullmatch(raw["version"]):
        raise SkillSpecError("version must use semantic versioning")
    if not isinstance(allowed_tool_refs, (set, frozenset)) or not isinstance(registered_schema_refs, (set, frozenset)):
        raise SkillSpecError("tool and schema registries must be trusted sets")

    skill_id = _identifier(raw["skill_id"], "skill_id")
    display_name = _text(raw["display_name"], "display_name", 80)
    description = _text(raw["description"], "description", 500)
    task_intents = _identifier_list(raw["task_intents"], "task_intents", minimum=1, maximum=6)
    if not set(task_intents).issubset(TASK_INTENTS):
        raise SkillSpecError("task_intents contain an unsupported intent")

    input_schema_ref = _identifier(raw["input_schema_ref"], "input_schema_ref")
    output_schema_ref = _identifier(raw["output_schema_ref"], "output_schema_ref")
    if input_schema_ref not in registered_schema_refs or output_schema_ref not in registered_schema_refs:
        raise SkillSpecError("input/output schema must already exist in the trusted schema registry")

    tool_refs = _identifier_list(raw["tool_refs"], "tool_refs", minimum=1, maximum=8)
    for tool_ref in tool_refs:
        lowered = tool_ref.lower().replace(".", "_").replace("-", "_")
        if any(part in lowered for part in _FORBIDDEN_TOOL_PARTS):
            raise SkillSpecError("Skill requests a forbidden write, execution, broker or privileged tool")
        if tool_ref not in allowed_tool_refs:
            raise SkillSpecError("Skill references a tool outside the server-owned allowlist")

    data_scope = raw["data_scope"]
    if data_scope not in DATA_SCOPES:
        raise SkillSpecError("data_scope must be public_research or owner_workspace")

    preconditions = _identifier_list(raw["preconditions"], "preconditions", minimum=1, maximum=10)
    postconditions = _identifier_list(raw["postconditions"], "postconditions", minimum=1, maximum=10)
    failure_modes = _identifier_list(raw["failure_modes"], "failure_modes", minimum=1, maximum=10)

    timeout_ms = raw["timeout_ms"]
    max_steps = raw["max_steps"]
    max_tool_calls = raw["max_tool_calls"]
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 20_000:
        raise SkillSpecError("timeout_ms must be an integer from 1 to 20000")
    if type(max_steps) is not int or not 1 <= max_steps <= 12:
        raise SkillSpecError("max_steps must be an integer from 1 to 12")
    if type(max_tool_calls) is not int or not 0 <= max_tool_calls <= 12:
        raise SkillSpecError("max_tool_calls must be an integer from 0 to 12")
    if max_tool_calls > max_steps:
        raise SkillSpecError("max_tool_calls cannot exceed max_steps")

    evidence_refs = _identifier_list(raw["evidence_refs"], "evidence_refs", minimum=1, maximum=20)
    evaluation_report_ref = raw["evaluation_report_ref"]
    if evaluation_report_ref is not None:
        evaluation_report_ref = _identifier(evaluation_report_ref, "evaluation_report_ref")

    return {
        "contract": SKILL_CONTRACT,
        "skill_id": skill_id,
        "version": raw["version"],
        "display_name": display_name,
        "description": description,
        "task_intents": task_intents,
        "input_schema_ref": input_schema_ref,
        "output_schema_ref": output_schema_ref,
        "tool_refs": tool_refs,
        "data_scope": data_scope,
        "preconditions": preconditions,
        "postconditions": postconditions,
        "failure_modes": failure_modes,
        "timeout_ms": timeout_ms,
        "max_steps": max_steps,
        "max_tool_calls": max_tool_calls,
        "evidence_refs": evidence_refs,
        "evaluation_report_ref": evaluation_report_ref,
        "policy_version": _identifier(raw["policy_version"], "policy_version"),
        "research_only": True,
    }


def skill_content_sha256(spec: Mapping[str, Any]) -> str:
    """Return a deterministic hash for a validated Skill specification."""
    if not isinstance(spec, Mapping):
        raise SkillSpecError("spec must be an object")
    canonical = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return sha256(canonical.encode("utf-8")).hexdigest()
