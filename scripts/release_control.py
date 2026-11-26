#!/usr/bin/env python3
"""Fail-closed release evidence primitives for WO-2026-11-26-008.

This module never deploys, mutates Git refs, or contacts a broker.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKFLOW_VERSION = "wo-2026-11-26-008/v1"
REQUIRED_CHECKS = (
    "nova-frontend-contract",
    "nova-smc-python",
    "nova-smc-worker",
    "nova-mt5-bridge-python",
    "nova-quant-contract",
    "nova-notebook-validation-python",
)
EVIDENCE_FILES = (
    ".circleci/config.yml",
    "docs/release/WO-2026-11-26-008-CIRCLECI-RELEASE-CONTROL.md",
    "scripts/release_control.py",
    "tests/test_release_control.py",
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class EvidenceError(ValueError):
    """Raised when release or rollback evidence is incomplete or inconsistent."""


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _require_sha(value: str, field: str = "commit_sha") -> str:
    if not isinstance(value, str) or not SHA_RE.fullmatch(value):
        raise EvidenceError(f"{field} must be a full lowercase 40-character Git SHA")
    return value


def _safe_file(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    base = root.resolve()
    if base not in candidate.parents or not candidate.is_file():
        raise EvidenceError(f"required evidence file is missing or outside repository: {relative}")
    return candidate


def artifact_digests(root: Path) -> dict[str, str]:
    return {
        relative: _sha256(_safe_file(root, relative).read_bytes())
        for relative in EVIDENCE_FILES
    }


def _marker_identity(repository: str, commit_sha: str, workflow_version: str, digests: dict[str, str]) -> str:
    identity = {
        "repository": repository,
        "commit_sha": commit_sha,
        "workflow_version": workflow_version,
        "artifact_sha256": digests,
    }
    return _sha256(_canonical(identity))


def create_release_marker(
    *,
    repository: str,
    commit_sha: str,
    root: Path,
    review_evidence_reference: str,
    approval_build_url: str,
    created_at_utc: str | None = None,
) -> dict[str, Any]:
    _require_sha(commit_sha)
    if not repository or "/" not in repository:
        raise EvidenceError("repository must be owner/name")
    if not review_evidence_reference.startswith("https://github.com/"):
        raise EvidenceError("review_evidence_reference must be a GitHub URL")
    if not approval_build_url.startswith("https://app.circleci.com/pipelines/"):
        raise EvidenceError("approval_build_url must identify the CircleCI approval pipeline")
    digests = artifact_digests(root)
    marker = {
        "schema_version": 1,
        "marker_type": "nova-release-candidate",
        "marker_status": "CANDIDATE_ONLY_NOT_DEPLOY_AUTHORIZATION",
        "marker_id": _marker_identity(repository, commit_sha, WORKFLOW_VERSION, digests),
        "repository": repository,
        "commit_sha": commit_sha,
        "workflow_version": WORKFLOW_VERSION,
        "created_at_utc": created_at_utc or datetime.now(timezone.utc).isoformat(),
        "artifact_sha256": digests,
        "required_circleci_checks": [{"name": name, "status": "passed"} for name in REQUIRED_CHECKS],
        "circleci_approval": {
            "status": "approval_gate_completed",
            "pipeline_url": approval_build_url,
            "approver_identity": None,
            "approver_timestamp_utc": None,
            "identity_limitation": "CircleCI approval-job completion is recorded; approver identity/timestamp are not asserted.",
        },
        "github_review_evidence": {
            "reference": review_evidence_reference,
            "verification": "NOT_MACHINE_VERIFIED",
        },
        "production_deploy_owner": "GitHub Actions",
        "production_deploy_executed_by_circleci": False,
        "safety": {
            "ordersEnabled": False,
            "executionEnabled": False,
            "liveTradingEnabled": False,
        },
    }
    validate_release_marker(marker, repository=repository, commit_sha=commit_sha, root=root)
    return marker


def validate_release_marker(
    marker: dict[str, Any], *, repository: str, commit_sha: str, root: Path
) -> None:
    _require_sha(commit_sha)
    if marker.get("repository") != repository or marker.get("commit_sha") != commit_sha:
        raise EvidenceError("marker repository/SHA does not match the exact candidate checkout")
    if marker.get("workflow_version") != WORKFLOW_VERSION:
        raise EvidenceError("unsupported workflow version")
    if marker.get("marker_status") != "CANDIDATE_ONLY_NOT_DEPLOY_AUTHORIZATION":
        raise EvidenceError("marker status is not an allowed candidate-only state")
    expected = artifact_digests(root)
    if marker.get("artifact_sha256") != expected:
        raise EvidenceError("one or more release evidence artifacts changed after marker creation")
    expected_id = _marker_identity(repository, commit_sha, WORKFLOW_VERSION, expected)
    if marker.get("marker_id") != expected_id:
        raise EvidenceError("marker_id is invalid")
    checks = marker.get("required_circleci_checks", [])
    if {item.get("name") for item in checks if item.get("status") == "passed"} != set(REQUIRED_CHECKS):
        raise EvidenceError("required CircleCI checks are missing or not passed")
    approval = marker.get("circleci_approval", {})
    if approval.get("status") != "approval_gate_completed" or not approval.get("pipeline_url"):
        raise EvidenceError("CircleCI approval gate has not completed")
    if marker.get("github_review_evidence", {}).get("verification") != "NOT_MACHINE_VERIFIED":
        raise EvidenceError("GitHub review evidence state is invalid")
    if marker.get("production_deploy_owner") != "GitHub Actions":
        raise EvidenceError("GitHub Actions must remain the production deployment owner")
    if marker.get("production_deploy_executed_by_circleci") is not False:
        raise EvidenceError("CircleCI must never claim or execute production deployment")
    safety = marker.get("safety", {})
    if any(safety.get(key) is not False for key in ("ordersEnabled", "executionEnabled", "liveTradingEnabled")):
        raise EvidenceError("trading safety invariants must remain false")


def write_immutable_json(path: Path, payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(encoded)
        return "created"
    except FileExistsError:
        existing = path.read_text(encoding="utf-8")
        if existing == encoded:
            return "already_exists_identical"
        try:
            existing_payload = json.loads(existing)
        except json.JSONDecodeError as exc:
            raise EvidenceError("immutable evidence path contains invalid JSON") from exc
        stable_key = "marker_id" if "marker_id" in payload else "request_id"
        if payload.get(stable_key) and existing_payload.get(stable_key) == payload.get(stable_key):
            return "already_exists_same_identity"
        raise EvidenceError("immutable evidence path already exists with different identity")


def create_rollback_request(
    *,
    target_sha: str,
    evidence_reference: str,
    reason: str,
    repository: str,
    root: Path,
) -> dict[str, Any]:
    _require_sha(target_sha, "rollback_target_sha")
    if not evidence_reference.startswith("https://github.com/") or "/actions/runs/" not in evidence_reference:
        raise EvidenceError("rollback evidence must reference a GitHub Actions deployment run")
    if not reason.strip() or len(reason) > 1000:
        raise EvidenceError("rollback reason is required and must be <= 1000 characters")
    exists = subprocess.run(
        ["git", "cat-file", "-e", f"{target_sha}^{{commit}}"],
        cwd=root, check=False, capture_output=True, text=True,
    )
    if exists.returncode != 0:
        raise EvidenceError("rollback target commit does not exist in this checkout")
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", target_sha, "origin/main"],
        cwd=root, check=False, capture_output=True, text=True,
    )
    if ancestor.returncode != 0:
        raise EvidenceError("rollback target is not an ancestor of current origin/main")
    request_identity = {
        "repository": repository,
        "target_sha": target_sha,
        "deployment_evidence_reference": evidence_reference,
        "reason": reason,
    }
    return {
        "schema_version": 1,
        "request_id": _sha256(_canonical(request_identity)),
        "request_type": "production-rollback",
        "request_status": "PENDING_GITHUB_ACTIONS_OPERATOR_VERIFICATION",
        "repository": repository,
        "target_sha": target_sha,
        "deployment_evidence_reference": evidence_reference,
        "reason": reason,
        "evidence_verification": "NOT_MACHINE_VERIFIED_BY_CIRCLECI",
        "required_next_gate": "GitHub Actions operator must verify deployed SHA, known-good status, approval, and rollback plan.",
        "execution_owner": "GitHub Actions",
        "execution_status": "NOT_EXECUTED",
        "circleci_deploy_or_rollback_executed": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "safety": {"ordersEnabled": False, "executionEnabled": False, "liveTradingEnabled": False},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    marker_parser = sub.add_parser("create-marker")
    marker_parser.add_argument("--repository", required=True)
    marker_parser.add_argument("--sha", required=True)
    marker_parser.add_argument("--review-evidence", required=True)
    marker_parser.add_argument("--approval-build-url", required=True)
    marker_parser.add_argument("--output", default="release-evidence/release-marker.json")
    validate_parser = sub.add_parser("validate-marker")
    validate_parser.add_argument("--repository", required=True)
    validate_parser.add_argument("--sha", required=True)
    validate_parser.add_argument("--marker", default="release-evidence/release-marker.json")
    rollback_parser = sub.add_parser("rollback-request")
    rollback_parser.add_argument("--repository", required=True)
    rollback_parser.add_argument("--target-sha", required=True)
    rollback_parser.add_argument("--evidence", required=True)
    rollback_parser.add_argument("--reason", required=True)
    rollback_parser.add_argument("--output", default="rollback-evidence/rollback-request.json")
    args = parser.parse_args()
    root = Path.cwd()
    if args.command == "create-marker":
        payload = create_release_marker(
            repository=args.repository, commit_sha=args.sha, root=root,
            review_evidence_reference=args.review_evidence,
            approval_build_url=args.approval_build_url,
        )
        result = write_immutable_json(root / args.output, payload)
        print(json.dumps({"result": result, "marker_id": payload["marker_id"]}, indent=2))
    elif args.command == "validate-marker":
        marker = json.loads((root / args.marker).read_text(encoding="utf-8"))
        validate_release_marker(marker, repository=args.repository, commit_sha=args.sha, root=root)
        print("release marker validation: PASS")
    else:
        payload = create_rollback_request(
            target_sha=args.target_sha, evidence_reference=args.evidence,
            reason=args.reason, repository=args.repository, root=root,
        )
        write_immutable_json(root / args.output, payload)
        print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
