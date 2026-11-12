# NOVA Gold Lab

NOVA Gold Lab is the governed research workspace for NOVA AI Trading. It is separate from VOOM Studio Affiliate and NOVA Video. It is not a production runtime and must not submit trades.

## Responsibilities

- Reproducible market-data diagnostics and provenance checks.
- Feature engineering and research experiments for SMC Mean Rejection, XGBoost, and PyTorch LSTM.\n- SMC Mean Rejection is the primary deterministic strategy replacing Wave3; Wave3 is retained only as historical research/benchmark context, not an active primary strategy.
- Cost-aware backtests, walk-forward evaluation, and sealed out-of-sample reporting.
- Model artifact evaluation and handoff to reviewed Python inference modules.

## Workspace boundaries

| Layer | Responsibility | Authoritative location |
|---|---|---|
| Research | Experiments, diagnostics, training notebooks | `notebooks/` |
| Source control | Notebook source, tests, manifests, review history | GitHub NOVA repository |
| Compute | Bounded CPU experiments and approved training | Kaggle CPU / approved cloud Linux |
| Data | Versioned input exports and provenance manifests | Approved dataset storage; never commit secrets |
| Production | Reviewed inference code and API integration | NOVA application modules |

## Non-negotiable data gates

1. Use genuine Exness XAUUSDm H1 history only when symbol, timeframe, OHLC, tick volume semantics, UTC timestamps, source provenance, and coverage are verified.
2. Reject synthetic or fabricated market observations and synthetic volume.
3. Check ordering, duplicates, OHLC bounds, missing intervals, requested boundary coverage, and dataset hashes before persistence or training.
4. The final out-of-sample boundary is sealed at `2026-07-01T00:00:00Z` exclusive. Do not tune against data at or after that boundary.
5. Do not train on incomplete or unverified data. A failed data gate must stop the pipeline.

## Strategy and model research gates\n\n- Primary strategy: SMC Mean Rejection (4H confirmed structure/EQ/OB/FVG context; 5M liquidity sweep and price-action confirmation).\n- XGBoost and PyTorch LSTM remain separate supporting model candidates; do not register SMC as a model vote in the Meta Decision Layer.\n- Wave3 is retired from the primary strategy path. Preserve historical artifacts and sealed benchmark records; do not silently delete or rewrite old research.\n\n## Model research gates

- Keep train/validation/test periods chronological and prevent leakage.
- Include transaction costs and realistic execution assumptions in backtests.
- Compare against a documented baseline.
- Preserve experiment parameters, code revision, dataset hash, environment, metrics, and model artifact hashes.
- Do not promote a model from a notebook directly into production. Port reviewed logic into tested Python modules and require independent validation.
- No claim of positive edge without the required closed out-of-sample sample and evidence.

## Security and execution

- Store API tokens, broker tokens, and tenant identifiers only in the approved notebook secret store or CI secret store. Never place credentials in notebook cells, outputs, Git history, or dataset manifests.
- Notebook access to the MT5 bridge is read-only. No order, withdrawal, transfer, or live-trading capability is permitted.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Prefer Kaggle Free CPU and Linux/cloud environments. Windows MT5 Bridge remains a separately controlled data-source dependency until a verified headless replacement exists.

## Notebook lifecycle

1. Inspect and validate source data.
2. Record immutable dataset identity and provenance.
3. Run deterministic preprocessing and bounded experiments.
4. Execute the notebook top-to-bottom and inspect saved outputs.
5. Run exact-head CI and notebook contract tests.
6. Submit changes through a pull request; do not edit `main` directly.
7. Export reviewed inference code and model artifacts separately; production deployment requires its own approval and tests.

## Current implementation status

- The main branch currently contains a Colab runtime preflight notebook, not the complete Gold Lab research notebook.
- PR #243 is the existing XAUUSD H1 CPU research notebook candidate. It is separate from this governance/index change and must be reviewed on its current head, rebased or otherwise reconciled with current `main`, and pass exact-head validation before it is considered integrated.
- This document establishes the workspace rules. It does not assert that data ingestion, training, model quality, or production readiness has succeeded.
