"""Deterministic, non-executable compiler for declarative NOVA Skills.

This module validates and packages a Skill specification into a canonical
artifact. It does not execute generated code, call tools, persist records,
publish Skills, or grant permissions. Trusted callers must supply server-owned
tool and schema registries.
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from typing import Any, Mapping

from .skill_spec import (
    SKILL_CONTRACT,
    SkillSpecError,
    skill_content_sha256,
    validate_skill_spec,
)

COMPILED_SKILL_CONTRACT = "nova.skill-build.v1"
COMPILER_VERSION = "1.0.0"
_BUILD_FIELDS = frozenset({
    "contract",
    "compiler_version",
    "skill_id",
    "skill_version",
    "content_sha256",
    "artifact_sha256",
    "artifact",
    "state",
    "research_only",
    "execution_enabled",
    "publication_enabled",
})


class SkillBuildError(ValueError):
    """Raised when a compiled Skill artifact is invalid or unsafe."""


def _canonical_json(value: Mapping[str, Any]) -> str:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise SkillBuildError("artifact must contain canonical JSON values") from exc


def _sha256_text(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _validate_build_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(manifest, Mapping):
        raise SkillBuildError("build manifest must be an object")
    if set(manifest) != _BUILD_FIELDS:
        raise SkillBuildError("build manifest has missing or unknown fields")
    if manifest.get("contract") != COMPILED_SKILL_CONTRACT:
        raise SkillBuildError("unsupported build manifest contract")
    if manifest.get("state") != "COMPILED_PENDING_EVALUATION":
        raise SkillBuildError("compiled Skill is not in an accepted build state")
    if manifest.get("research_only") is not True:
        raise SkillBuildError("research-only invariant is missing")
    if manifest.get("execution_enabled") is not False or manifest.get("publication_enabled") is not False:
        raise SkillBuildError("compiled Skill cannot enable execution or publication")
    artifact = manifest.get("artifact")
    if not isinstance(artifact, Mapping) or artifact.get("contract") != SKILL_CONTRACT:
        raise SkillBuildError("manifest artifact is not a NOVA Skill specification")
    content_hash = skill_content_sha256(artifact)
    artifact_hash = _sha256_text(_canonical_json(artifact))
    if manifest.get("content_sha256") != content_hash:
        raise SkillBuildError("content hash does not match the Skill specification")
    if manifest.get("artifact_sha256") != artifact_hash:
        raise SkillBuildError("artifact hash does not match canonical artifact bytes")
    if manifest.get("skill_id") != artifact.get("skill_id"):
        raise SkillBuildError("manifest Skill ID does not match its artifact")
    if manifest.get("skill_version") != artifact.get("version"):
        raise SkillBuildError("manifest Skill version does not match its artifact")
    if not isinstance(manifest.get("compiler_version"), str) or not manifest["compiler_version"].strip():
        raise SkillBuildError("compiler_version is required")
    return deepcopy(dict(manifest))


def compile_skill_candidate(
    raw_spec: Mapping[str, Any],
    *,
    allowed_tool_refs: set[str] | frozenset[str],
    registered_schema_refs: set[str] | frozenset[str],
    compiler_version: str = COMPILER_VERSION,
) -> dict[str, Any]:
    """Validate and compile a declarative Skill into a canonical inert artifact."""
    if not isinstance(compiler_version, str) or not compiler_version.strip() or len(compiler_version) > 40:
        raise SkillBuildError("compiler_version must be a bounded non-empty string")
    try:
        validated = validate_skill_spec(
            raw_spec,
            allowed_tool_refs=allowed_tool_refs,
            registered_schema_refs=registered_schema_refs,
        )
    except SkillSpecError as exc:
        raise SkillBuildError(str(exc)) from exc

    canonical = _canonical_json(validated)
    content_hash = skill_content_sha256(validated)
    return {
        "contract": COMPILED_SKILL_CONTRACT,
        "compiler_version": compiler_version,
        "skill_id": validated["skill_id"],
        "skill_version": validated["version"],
        "content_sha256": content_hash,
        "artifact_sha256": _sha256_text(canonical),
        "artifact": json.loads(canonical),
        "state": "COMPILED_PENDING_EVALUATION",
        "research_only": True,
        "execution_enabled": False,
        "publication_enabled": False,
    }


def recompile_skill_candidate(
    raw_spec: Mapping[str, Any],
    *,
    previous_manifest: Mapping[str, Any] | None,
    allowed_tool_refs: set[str] | frozenset[str],
    registered_schema_refs: set[str] | frozenset[str],
    compiler_version: str = COMPILER_VERSION,
) -> dict[str, Any]:
    """Recompile only when canonical content or compiler version has changed.

    A previous manifest is treated as untrusted input. It is reused only when
    its complete structure and hashes validate and it exactly equals the newly
    compiled result. This is an in-memory deterministic primitive, not durable
    cache storage or a publication mechanism.
    """
    current = compile_skill_candidate(
        raw_spec,
        allowed_tool_refs=allowed_tool_refs,
        registered_schema_refs=registered_schema_refs,
        compiler_version=compiler_version,
    )
    if previous_manifest is not None:
        try:
            previous = _validate_build_manifest(previous_manifest)
        except SkillBuildError:
            previous = None
        if previous == current:
            return {"changed": False, "reason": "content_and_compiler_unchanged", "manifest": current}
    reason = "initial_compile" if previous_manifest is None else "content_or_compiler_changed"
    return {"changed": True, "reason": reason, "manifest": current}


def lint_compiled_skill(
    manifest: Mapping[str, Any],
    *,
    allowed_tool_refs: set[str] | frozenset[str],
    registered_schema_refs: set[str] | frozenset[str],
) -> dict[str, Any]:
    """Run deterministic static checks; never executes or publishes the Skill."""
    validated_manifest = _validate_build_manifest(manifest)
    try:
        validated_spec = validate_skill_spec(
            validated_manifest["artifact"],
            allowed_tool_refs=allowed_tool_refs,
            registered_schema_refs=registered_schema_refs,
        )
    except SkillSpecError as exc:
        raise SkillBuildError("compiled artifact failed registry-aware lint: " + str(exc)) from exc
    if validated_spec != validated_manifest["artifact"]:
        raise SkillBuildError("compiled artifact is not in normalized canonical form")
    findings = []
    if validated_spec["evaluation_report_ref"] is None:
        findings.append({
            "code": "EVALUATION_REPORT_MISSING",
            "severity": "blocking",
            "message": "Skill requires an immutable evaluation report before review.",
        })
    return {
        "contract": "nova.skill-lint.v1",
        "skill_id": validated_spec["skill_id"],
        "skill_version": validated_spec["version"],
        "content_sha256": validated_manifest["content_sha256"],
        "passed": not findings,
        "findings": findings,
        "execution_enabled": False,
        "publication_enabled": False,
    }
