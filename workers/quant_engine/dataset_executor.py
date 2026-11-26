"""Synchronous, bounded executor for the first QuantLab job type."""
from __future__ import annotations

import os
from typing import Any

from workers.quant_engine.dataset_artifact import (
    DatasetArtifactError,
    validate_dataset_artifact,
)


class UnsupportedJobType(ValueError):
    pass


def execute_claimed_job(claim: dict[str, Any], *, artifact_root: str | None = None) -> dict[str, Any]:
    """Execute only dataset.validate; all other job types fail closed."""
    if not isinstance(claim, dict) or not isinstance(claim.get("job"), dict):
        raise ValueError("invalid_claim")
    job = claim["job"]
    if job.get("job_type") != "dataset.validate":
        raise UnsupportedJobType("executor_not_implemented_for_job_type")
    tenant_id = job.get("tenant_id")
    payload = claim.get("payload")
    if not isinstance(tenant_id, str) or not isinstance(payload, dict):
        raise ValueError("invalid_claim_payload")
    experiment = payload.get("experiment")
    if not isinstance(experiment, dict):
        raise ValueError("invalid_experiment")
    dataset_id = experiment.get("dataset_artifact_id")
    expected_sha = experiment.get("dataset_sha256")
    reject_gaps = experiment.get("reject_gaps", False)
    root = artifact_root or os.getenv("QUANTLAB_DATASET_ROOT", "")
    if not root:
        raise DatasetArtifactError("dataset_root_not_configured")
    return validate_dataset_artifact(
        artifact_root=root,
        tenant_id=tenant_id,
        dataset_id=dataset_id,
        expected_dataset_sha256=expected_sha,
        reject_gaps=reject_gaps,
    )
