"""Cross-record integrity validation for a Research Evidence Graph.

This validates links between already versioned contract payloads. It is pure
and storage-neutral: it does not authorize owners/tenants, persist records,
fetch URLs, or execute source content.
"""
from __future__ import annotations

from typing import Any, Callable

from .contracts import (
    ContractValidationError,
    validate_research_claim,
    validate_research_hypothesis,
    validate_research_source,
    validate_research_task,
)

_MAX_RECORDS = 100


def _validated_list(
    value: Any,
    name: str,
    validator: Callable[[Any], dict[str, Any]],
    *,
    minimum: int = 0,
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) < minimum or len(value) > _MAX_RECORDS:
        raise ContractValidationError(
            f"{name} must be a list with {minimum}..{_MAX_RECORDS} records"
        )
    return [validator(item) for item in value]


def validate_research_evidence_graph(
    task_payload: Any,
    source_payloads: Any,
    claim_payloads: Any,
    hypothesis_payloads: Any,
) -> dict[str, Any]:
    """Validate record schemas and all cross-record evidence references.

    Passage IDs must be unique across the supplied research graph because claim
    evidence references currently identify passages by passage_id alone. A
    claim may only cite passage IDs belonging to one of its declared source_ids.
    All claim and hypothesis records must belong to the task's research_id.
    """
    task = validate_research_task(task_payload)
    sources = _validated_list(
        source_payloads, "sources", validate_research_source, minimum=1
    )
    claims = _validated_list(claim_payloads, "claims", validate_research_claim)
    hypotheses = _validated_list(
        hypothesis_payloads, "hypotheses", validate_research_hypothesis
    )
    research_id = task["research_id"]

    source_by_id: dict[str, dict[str, Any]] = {}
    passage_source_by_id: dict[str, str] = {}
    for source in sources:
        source_id = source["source_id"]
        if source_id in source_by_id:
            raise ContractValidationError("source_id values must be unique in a research graph")
        source_by_id[source_id] = source
        for passage in source["passages"]:
            passage_id = passage["passage_id"]
            if passage_id in passage_source_by_id:
                raise ContractValidationError(
                    "passage_id values must be unique across a research graph"
                )
            passage_source_by_id[passage_id] = source_id

    claim_by_id: dict[str, dict[str, Any]] = {}
    for claim in claims:
        claim_id = claim["claim_id"]
        if claim_id in claim_by_id:
            raise ContractValidationError("claim_id values must be unique in a research graph")
        if claim["research_id"] != research_id:
            raise ContractValidationError(
                f"claim {claim_id} belongs to a different research_id"
            )
        claim_by_id[claim_id] = claim

        missing_sources = set(claim["source_ids"]) - source_by_id.keys()
        if missing_sources:
            raise ContractValidationError(
                f"claim {claim_id} references unknown source_ids: "
                + ", ".join(sorted(missing_sources))
            )

        supporting = set(claim["supporting_evidence"])
        counter = set(claim["counter_evidence"])
        overlap = supporting & counter
        if overlap:
            raise ContractValidationError(
                f"claim {claim_id} cannot use the same passage as support and counter-evidence"
            )

        referenced_passages = supporting | counter
        missing_passages = referenced_passages - passage_source_by_id.keys()
        if missing_passages:
            raise ContractValidationError(
                f"claim {claim_id} references unknown passage_ids: "
                + ", ".join(sorted(missing_passages))
            )

        out_of_scope = {
            passage_id
            for passage_id in referenced_passages
            if passage_source_by_id[passage_id] not in set(claim["source_ids"])
        }
        if out_of_scope:
            raise ContractValidationError(
                f"claim {claim_id} references passages outside its source_ids: "
                + ", ".join(sorted(out_of_scope))
            )

        if claim["classification"] in {"observed", "corroborated"} and not supporting:
            raise ContractValidationError(
                f"claim {claim_id} requires supporting passage evidence"
            )

    hypothesis_ids: set[str] = set()
    for hypothesis in hypotheses:
        hypothesis_id = hypothesis["hypothesis_id"]
        if hypothesis_id in hypothesis_ids:
            raise ContractValidationError(
                "hypothesis_id values must be unique in a research graph"
            )
        hypothesis_ids.add(hypothesis_id)
        if hypothesis["research_id"] != research_id:
            raise ContractValidationError(
                f"hypothesis {hypothesis_id} belongs to a different research_id"
            )

        supporting = set(hypothesis["supporting_claim_ids"])
        counter = set(hypothesis["counter_claim_ids"])
        overlap = supporting & counter
        if overlap:
            raise ContractValidationError(
                f"hypothesis {hypothesis_id} cannot classify the same claim as supporting and counter"
            )

        referenced_claims = supporting | counter
        missing_claims = referenced_claims - claim_by_id.keys()
        if missing_claims:
            raise ContractValidationError(
                f"hypothesis {hypothesis_id} references unknown claim_ids: "
                + ", ".join(sorted(missing_claims))
            )

    return {
        "task": task,
        "sources": sources,
        "claims": claims,
        "hypotheses": hypotheses,
    }
