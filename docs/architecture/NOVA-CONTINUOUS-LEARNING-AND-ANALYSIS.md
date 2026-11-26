# NOVA Continuous Learning & Analysis Architecture

Status: Proposed implementation contract
Branch: feature/continuous-learning-mcp-orchestrator
Base: main @ 0cceaf5d1d32b4323bcf72f9f26877c6d75886ff

## Objective

Expose NOVA's existing research, model-analysis, and learning capabilities through authenticated MCP tools and a durable orchestration pipeline. Continuous learning is research-only by default. Training must never promote or deploy a model automatically.

## Current evidence and constraints

- The MCP gateway currently exposes 15 tools. It has no complete Learning Orchestrator API.
- `workers/quant_engine/README.md` explicitly states that the package does not fetch market data, train models, persist runs, or execute folds as a production service.
- `workers/quant_engine/training.py` currently returns mock checkpoint bytes and fixed metrics. It is not a real trainer and must not be represented as one.
- `workers/quant_engine/meta_decision.py` combines supplied model votes; it does not train, fetch data, or submit orders.
- `workers/feature/supervised_xgboost_prototype.py` currently uses random funding values and reports training-set score. It must be repaired before its metrics can be trusted.
- `workers/backtest/walk_forward.py` is a research evaluator; its outputs require validation against the canonical OOS policy and data provenance.
- The Python worker folders are local modules/prototypes, not independently deployed Cloudflare Workers.

## Target architecture

1. MCP Gateway: authenticated, tenant-scoped control plane; validates inputs and dispatches jobs.
2. Analysis Engine: deterministic market/structure/feature analysis; returns provenance and versioned outputs.
3. Dataset Registry: immutable dataset manifests, SHA-256 fingerprints, UTC/timeframe coverage, source provenance, quality and gap checks.
4. Training Orchestrator: creates queued jobs in an authenticated compute runtime; does not perform heavy training inside Cloudflare Workers.
5. Model Workers: XGBoost, LSTM/PyTorch, vision, and other approved model families, each with explicit data/feature contracts.
6. Evaluation Engine: chronological train/validation/test and purged walk-forward OOS; records costs, baselines, metrics, folds, code/runtime versions and artifacts.
7. Meta Decision Layer: consumes only calibrated, approved OOS predictions; emits research signals, not broker orders.
8. Learning Memory: stores experiment lineage, errors, drift, feedback, model versions and evaluation evidence. It must not silently modify production models.
9. Model Registry & Approval: immutable candidate artifacts and explicit human approval/promotion lifecycle.
10. Dashboard: exposes job state, data quality, training progress, OOS evidence, drift, approval and audit history.

## MCP tool contract groups

### Analysis
- `analyze_market`
- `analyze_multi_timeframe`
- `analyze_smc_structure`
- `analyze_premium_discount`
- `analyze_model_predictions`
- `analyze_model_performance`

### Learning and training
- `learning_status`
- `learning_universe`
- `learning_dataset_audit`
- `learning_create_training_job`
- `learning_training_progress`
- `learning_model_registry`
- `learning_compare_models`
- `learning_evaluate_oos`

### Intelligence and memory
- `meta_decision_analysis`
- `model_consensus`
- `pattern_recognition`
- `vision_chart_analysis`
- `market_regime_detection`
- `knowledge_memory_search`

### Feedback and governance
- `learning_feedback`
- `learning_error_analysis`
- `learning_drift_detection`
- `learning_retrain_recommendation`
- `learning_approval_status`
- `learning_approve_candidate` (explicit authorized human action only)

Tool names are proposed contracts, not claims that the tools already exist or work.

## Learning Universe

The orchestrator must load the canonical 16-asset universe from a versioned registry. Do not hardcode a guessed list in the MCP gateway. Each asset must declare symbol mapping, broker/source, timeframe coverage, timezone, data status, and eligibility. Missing or stale assets remain blocked and visible.

## Required job lifecycle

`REQUESTED -> DATA_VALIDATION -> QUEUED -> TRAINING -> EVALUATION -> CANDIDATE`

Failure paths:
- `BLOCKED_DATA`
- `FAILED_TRAINING`
- `FAILED_EVALUATION`
- `REJECTED`

Promotion lifecycle:
`CANDIDATE -> PENDING_APPROVAL -> APPROVED -> DEPLOYED`

Only a separately authorized human approval may move a candidate to APPROVED. Deployment must be a separate action with rollback metadata. Retraining recommendations never trigger automatic promotion.

## Mandatory gates

1. Dataset manifest, source provenance, UTC alignment, timeframe coverage, missing-gap report and SHA-256 must pass.
2. No training, feature selection, threshold tuning or hyperparameter tuning on final OOS data.
3. Purge/embargo policy must be derived from label horizon and recorded in the experiment manifest.
4. Walk-forward test folds must be chronological and non-overlapping.
5. Evaluation must include fees, spread, slippage, swaps/funding where applicable, and a declared baseline.
6. Require at least 30 closed OOS trades where trade-based evaluation applies; positive net result and PF > 1.0 are necessary but not sufficient.
7. Classification models must beat a declared baseline and include calibration/robustness evidence.
8. Model disagreement, correlated errors, drift, missing calibration, stale data or insufficient OOS samples must fail closed.
9. All artifacts and metrics must be reproducible from immutable dataset, code, config, runtime and seed references.
10. Tenant isolation and authorization must be enforced for every read/write/job/artifact operation.

## Safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No broker order, position modification, withdrawal or transfer capability is added by this work.
- Training jobs are research jobs only.
- MCP must never claim a model is trained, evaluated, approved or deployed without persisted evidence and a verifiable artifact.
- Cloudflare Workers remain routing/control plane; heavy Python training runs in a separate authenticated compute process.

## Implementation sequence

1. Inventory existing modules, tests, data contracts, Supabase schema and runtime deployment.
2. Define versioned JSON schemas and tenant-scoped persistence for datasets, jobs, runs, metrics, artifacts, model candidates, approvals and feedback.
3. Replace mock training implementation with real deterministic training plus tests; fail if required ML dependencies/runtime are unavailable.
4. Repair XGBoost feature generation: remove random funding, use source-backed features or explicit missingness, chronological splits, and OOS-only reporting.
5. Add authenticated orchestration API and durable job state; use a separate compute runner for Python.
6. Implement Analysis MCP tools and read-only Learning status/audit/registry tools first.
7. Add job submission and progress tools only after persistence, authorization, queueing and cancellation are tested.
8. Add evaluation, drift, feedback and retrain recommendations.
9. Add explicit candidate approval and deployment/rollback controls as separate gated workflows.
10. Validate with unit, integration, tenant-isolation, failure-injection and end-to-end tests; publish exact commit and test evidence.

## Acceptance criteria

- MCP tools expose the actual Analysis and Learning service, not placeholder names.
- A submitted job is tenant-scoped, persisted, observable, cancellable and auditable.
- A training run produces a real checkpoint with checksum and reproducible manifest; mock bytes are rejected.
- Dataset and evaluation gates block invalid jobs before training or promotion.
- OOS evaluation is independent from training/tuning and has inspectable fold-level evidence.
- Model candidates cannot be promoted without explicit authorized approval.
- Dashboard reports truthful lifecycle states and artifact links.
- All safety invariants remain enforced and tested.

## Explicit non-goals

- No live trading enablement.
- No automatic model promotion or silent production replacement.
- No claim that all 16 assets are ready until the canonical registry and data coverage are verified.
- No deployment of Python modules as Cloudflare Workers.
- No merging directly to main without review and passing checks.
