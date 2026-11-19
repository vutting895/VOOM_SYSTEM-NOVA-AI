# NOVA Full-Universe Training Orchestrator — Delivery Plan

**Base:** `main@a6ee15e96fb83f811db676fcafa85565e3280f04`  
**Branch:** `feature/learning-universe-training-orchestrator`  
**Mode:** research-only; training and model promotion remain gated.

## Verified interpretation of "Universe 16"

The checked-in `LearningUniverseView.tsx` describes 16 monitored assets in the Feature Store. The current `server.ts` also declares a 16-symbol candidate universe: eight Exness-style FX/metal symbols and eight crypto symbols. This is an asset universe, not proof of 16 implemented learning algorithms.

The initial registry is sourced from the current `ALL_MAJOR_PAIRS` declaration:

- FX/metals: XAU/USDm, EUR/USDm, GBP/USDm, USD/JPYm, USD/CHFm, AUD/USDm, USD/CADm, NZD/USDm.
- Crypto: BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT, ADA/USDT, DOGE/USDT, TON/USDT.

Symbols are identifiers only. Hardcoded UI prices, sample metrics, and simulated candles are not training data.

## Source audit findings

1. `/api/auto-train/status` and `/api/auto-train/trigger` intentionally return HTTP 503 with `TRAINING_RUNTIME_NOT_CONFIGURED`.
2. The current UI calls those endpoints, but that does not constitute a working training runtime.
3. `workers/quant_engine/training.py` returns fixed mock checkpoint bytes and fixed validation loss. It must not be used as a real trainer.
4. `workers/quant_engine/torch_models.py` contains a small residual MLP, not the requested XGBoost + LSTM hybrid.
5. `workers/quant_engine/quality.py`, `identity.py`, `experiment.py`, and `splits.py` provide reusable validation, fingerprint, experiment-contract, purge and walk-forward primitives.
6. The legacy `learning_control.py` lists 10 workers; some instances are `None`, and its `run_pipeline` explicitly uses a simulated result path. Do not treat it as a production orchestrator.
7. `PROJECT_STRUCTURE.md` lists additional research module targets, but the tree contains prototype files and absent implementations. Presence in that document is not evidence of executable training.

## Implemented in this branch — Phase 0

- Added a canonical 16-asset registry.
- Added fail-closed per-asset/per-timeframe manifest checks.
- Requires real local data files, exact SHA-256, approved source, quality PASS and COMPLETE coverage.
- Combined training is eligible only when all 16 assets satisfy all required timeframes.
- Known gaps, missing files, unapproved sources, duplicate manifests and hash mismatches block the combined run.
- This phase does not fetch data or train models.

## Remaining implementation phases

### Phase 1 — Dataset ingestion and contracts
- Resolve the authoritative provider and terminal symbol for every asset.
- Ingest closed OHLCV bars and source provenance; never use UI sample prices or generated candles.
- Resolve provider calendars separately: FX/Metals market closures are not equivalent to Crypto 24x7.
- Build immutable H1/H4/D1 manifests, with explicit coverage and gap evidence.
- Reconcile XAUUSDm historical gap before enabling that dataset.

### Phase 2 — Combined feature pipeline
- Normalize return/volatility/volume features across assets; preserve asset identity.
- Build point-in-time MTF features with event-time/availability-time lineage.
- Do not use unconfirmed pivots, future bars, synthetic labels or model-generated labels as ground truth.

### Phase 3 — Hybrid trainer
- XGBoost + PyTorch LSTM base learners.
- Meta Decision Layer trained only on chronological out-of-fold predictions.
- Fit scalers and feature transforms inside each training fold.
- Save model, feature schema, code revision, dataset hashes, seeds and hyperparameters.

### Phase 4 — Evaluation
- Expanding walk-forward with explicit purge/embargo derived from label/holding horizon.
- Non-overlapping test windows, untouched final OOS, baseline comparison and realistic spread/commission/slippage/swap.
- Report per-asset, per-regime and aggregate metrics; never let a strong asset hide a failed asset.
- Enforce the existing NOVA acceptance gates, including the 2026-07-01 final OOS start where applicable. Historical data ending 2024-12-15 cannot satisfy that OOS requirement.

### Phase 5 — Approval and persistence
- Persist immutable run manifests and artifacts to the approved research storage.
- Candidate lifecycle: DRAFT → DATA_VALIDATED → EXPERIMENT_READY → EVALUATED → REVIEW_PENDING → APPROVED_FOR_SHADOW / REJECTED.
- No automatic promotion and no execution capability.

## Safety invariants

```text
ordersEnabled = false
executionEnabled = false
liveTradingEnabled = false
broker_write_capability = absent
```

No broker connection, order API, production deployment, migration, secret intake, or live activation is part of this branch.
