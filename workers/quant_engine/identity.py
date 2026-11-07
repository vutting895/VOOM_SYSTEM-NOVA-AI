"""Reproducible identities for quant experiment runs."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Mapping

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def build_run_fingerprint(
    *,
    dataset_sha256: str,
    code_revision: str,
    strategy_id: str,
    strategy_version: str,
    parameters: Mapping[str, Any],
    evaluation: Mapping[str, Any],
    seed: int = 0,
) -> str:
    """Hash all material run inputs; timestamps and random IDs are omitted."""
    if not isinstance(dataset_sha256, str) or not _SHA256_RE.fullmatch(dataset_sha256):
        raise ValueError("dataset_sha256 must be a lowercase 64-character SHA-256 hex digest")
    for name, value in (("code_revision", code_revision), ("strategy_id", strategy_id), ("strategy_version", strategy_version)):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{name} must be a non-empty string")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise ValueError("seed must be an integer")
    if not isinstance(parameters, Mapping) or not isinstance(evaluation, Mapping):
        raise ValueError("parameters and evaluation must be mappings")

    manifest = {
        "schema_version": "nova.quant-run.v1",
        "dataset_sha256": dataset_sha256,
        "code_revision": code_revision,
        "strategy_id": strategy_id,
        "strategy_version": strategy_version,
        "parameters": dict(parameters),
        "evaluation": dict(evaluation),
        "seed": seed,
    }
    try:
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ValueError("parameters and evaluation must contain finite JSON-compatible values") from exc
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
