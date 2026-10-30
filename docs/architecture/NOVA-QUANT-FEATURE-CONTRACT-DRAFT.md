# NOVA Quant Feature Contract — Draft Decision Record

**Status:** Draft / blocked on feature semantics and research-owner approval  
**Scope:** Contract design only. This document does not define production features, train a model, expose an API, or connect the Quant Engine to an Agent or broker.

## 1. Why this contract is needed

The current `QuantumQuantEngine` accepts a two-dimensional training matrix with exactly `n_qubits` columns and a one-dimensional binary label vector. Inference accepts exactly the same number of numeric values. The default is four columns.

The repository's existing `workers/feature/smc_wave/smc_strategy.py` is a separate SMC research analyzer. It consumes OHLC candles and emits structure events, FVG/OB/liquidity-sweep candidates and research metadata. It does **not** currently publish a canonical, named four-column feature vector or a production feature registry. Its output must not be silently mapped to the engine's four numeric inputs.

Therefore, feature names, units, transforms, target labels and horizon remain intentionally undefined pending product/research approval.

## 2. Proposed envelope (not yet an accepted API)

A future producer/consumer boundary should carry these logical fields:

| Field | Requirement | Purpose |
|---|---|---|
| `contract_id` | Required, fixed identifier | Prevent accidental cross-contract use |
| `contract_version` | Required, semantic version | Reject unknown or incompatible schema versions |
| `feature_schema_id` | Required, immutable registry key | Identifies the exact ordered feature definitions |
| `feature_schema_version` | Required | Pins units, transforms, null policy and ordering |
| `symbol` | Required, normalized instrument identifier | Market-data identity |
| `timeframe` | Required, normalized interval | Candle/feature interval |
| `as_of` | Required, UTC timestamp | Latest market observation available to this sample |
| `computed_at` | Required, UTC timestamp | Feature computation time |
| `source` | Required provenance descriptor | Feed/provider and source record/version |
| `values` | Required finite numeric array | Values in the exact registry-defined order |
| `quality` | Required status and diagnostics | Missing, stale, incomplete or invalid-data handling |

The registry, not the caller, must define the exact number and order of features, stable feature IDs, names, descriptions, units, value ranges, transformations, warm-up requirements and null policy. Until an approved registry exists, no example feature names or production values should be invented.

The producer must emit exactly the ordered vector expected by the model artifact. The consumer must reject a different schema ID/version, dimension, order, non-finite value, unknown timeframe, invalid timestamp, stale source, or non-ready quality status. No automatic column reordering or silent default values are allowed.

## 3. Training-label contract (mandatory before fitting)

The binary label is not a feature and must be stored separately from the inference vector. Before model training is enabled, the research owner must approve and version:

- target definition and economic meaning of class 0 and class 1;
- forward horizon and timestamp convention;
- return/price source and adjustment policy;
- threshold, neutral/ambiguous interval and treatment of costs;
- sample eligibility, overlapping-label policy and purge/embargo rules;
- label generation code/version and provenance.

Labels must be generated using only information available under the declared future horizon. Feature rows must be point-in-time snapshots as of their `as_of` timestamps. Training/validation/test splits must be chronological; all transforms and scalers must be fitted on training windows only. Any overlapping target horizons require a documented purge/embargo strategy.

## 4. Causality and SMC-specific caution

The current SMC analyzer computes some descriptive fields using the full candle sequence supplied to it, including future mitigation checks for FVG/OB candidates and an ATR summary over the supplied sequence. That is acceptable only when the supplied sequence ends at the sample's actual `as_of` time.

For historical dataset construction, do not call the analyzer once on the entire future-complete dataset and reuse its final-state outputs for earlier rows. Build each sample from a strictly truncated, point-in-time candle window, or implement and test an incremental causal feature extractor. Pivot fields may only become available after their declared right-bar confirmation. Future mitigation status, future candles, and post-`as_of` values must never leak into earlier feature rows.

## 5. Model compatibility metadata

Every trained artifact should persist, at minimum:

- model ID and immutable model version;
- backend (`CLASSICAL_LOGISTIC_REGRESSION` or research-only VQC);
- feature schema ID/version and ordered feature IDs;
- training dataset snapshot/version and date range;
- label contract ID/version and horizon;
- train/validation/test window definitions;
- scaler parameters fitted on the training partition;
- source-code commit and dependency lock/version;
- seed and training configuration;
- evaluation report reference and approval status.

Inference must load the schema metadata from the server-selected model artifact. A browser or caller must not choose arbitrary model paths, backend capabilities, tenant IDs or artifact versions.

## 6. Proposed inference response boundary

A future inference response should distinguish at least:

- `status`: `ok`, `not_ready`, `stale_data`, `schema_mismatch`, `invalid_features`, or `model_unavailable`;
- model ID/version and backend used;
- contract and feature-schema versions;
- symbol/timeframe, `as_of` and `computed_at`;
- probability/score only when status is `ok`;
- explicit calibration/evaluation metadata reference;
- `research_only: true`, `trade_authorized: false`, `order_submission_enabled: false`.

The response is an advisory research output only. It must not contain an order side, entry instruction, position-size authorization or broker command.

## 7. Security, tenancy and failure behavior

- Derive authenticated user and tenant context on the server from the validated session; never trust caller-supplied tenant identifiers.
- Keep model artifacts and inference endpoints private; no browser-to-Python direct access.
- Enforce bounded payload size, request timeout, rate limit and strict typed validation.
- Do not log credentials or raw account secrets. Apply tenant-scoped audit metadata.
- On schema mismatch, stale/incomplete data, unavailable model, timeout or malformed output, return a non-success status and abstain. Never fall back to fabricated values or a different feature schema.
- Keep the independent NOVA server-side risk policy authoritative. A valid research forecast cannot bypass portfolio limits, broker metadata checks, approval workflows or execution gates.

## 8. Acceptance gates before implementation

1. Research/product owner signs off on the four (or explicitly revised number of) feature definitions, units, transforms, order and timeframes.
2. Research owner signs off on label semantics, horizon, costs and leakage controls.
3. Feature producer has point-in-time tests, missing/stale-data tests and deterministic replay tests.
4. Model artifact records immutable feature and label contract versions.
5. Contract tests prove schema mismatch, ordering mismatch, NaN/Infinity, stale data and tenant-crossing requests fail closed.
6. Chronological benchmark compares the classical baseline and VQC on identical data; no quantum advantage claim without statistically supported out-of-sample evidence.
7. A separately reviewed private adapter or Node runtime port is approved before any Agent integration.
8. Independent risk-policy integration tests prove that research outputs cannot authorize orders or alter risk limits.

## 9. Current decision

**Do not implement a production feature vector or wire this engine to the Agent yet.** The repository currently contains an SMC research analyzer, but no approved feature registry or label contract. This draft establishes the interface requirements while leaving the domain semantics to an explicit research decision.
