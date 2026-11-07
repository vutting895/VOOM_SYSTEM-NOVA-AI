# NOVA AI Learning Engine v0.1

## Scope

The first release records completed trade experiences, calculates a transparent
risk-aware reward, provides performance aggregates, stores model candidate
metadata, and applies explicit approval gates to candidate promotion. The
market-data bridge loads only integrity-verified historical research datasets.

**Safety invariants**
- No broker adapter is imported or called.
- No order execution is possible from this package.
- Training is offline and is not triggered by API requests.
- Candidate approval does not deploy a model or switch a live strategy.
- Paper/backtest/demo/live environments are recorded separately; do not mix
  environments in evaluation reports.
- Data is never downloaded implicitly, and missing candles are never synthesized.

## Files

- `models.py`: SQLAlchemy 2.x tables for experiences, model versions and audit.
- `service.py`: idempotent collection, reward calculation, summaries and gates.
- `api.py`: optional FastAPI router with fail-closed approval authorization.
- `data_sources.py`: checksum-verified loaders for Exness and Binance snapshots,
  UTC/OHLCV checks, data-gap accounting, and purged chronological splits.

## Verified market data inputs

The data bridge expects the versioned inputs from [PR #197](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/197):

| Dataset ID | File | Declared range | Eligibility |
|---|---|---|---|
| `exness_xauusdm_m15` | `datasets/exness/demo/xauusdm_m15/` | XAUUSDm M15, 2022-07-21 to 2026-10-29 | candidate_only |
| `exness_xauusdm_h1_3y` | `data/market/exness/XAUUSDm_H1_3Y.csv` | XAUUSDm H1, requested 2023-11-06 to 2026-11-06 | blocked until max historical gap <= 96h and manifest is PASS |
| `binance_btcusdt_h1_5y` | `datasets/public/binance/btcusdt_h1/` | BTCUSDT H1, five-year snapshot | historical research candidate |
| `binance_btcusdt_h1_500` | `datasets/public/binance/btcusdt_h1/` | BTCUSDT H1, 500 closed bars | historical research candidate |

These sources are not live feeds and are not the frozen Wave3 benchmark dataset.
PR #197 must be merged or its versioned `datasets/` files must be made available
in the checkout before these paths can be loaded. Do not copy code ZIP archives
or random training tensors into the market-data directory.

The Exness H1 snapshot is loaded only by `load_exness_xauusdm_h1()` after its CSV SHA-256, byte count, OHLC/tick-volume schema, UTC timestamps, MT5 Demo metadata and observed gap statistics match the manifest. The loader rejects any unexplained gap over 96 hours and requires `training_eligible=true` plus `completeness_status=PASS`. The current PR #238 snapshot contains a 7,419-hour gap from 2025-12-31T21:00:00Z to 2026-11-06T00:00:00Z, so it is intentionally blocked. Re-ingest the missing period from the authorized Exness Demo MT5 Bridge; never synthesize bars or alter the manifest to bypass the gate.

Bounded weekend/market closures up to 96 hours are treated as continuous history for rolling features, while all missing intervals remain recorded in `missing_interval_count` and `gap_after_indices`. Unexplained gaps are separately exposed as `unexplained_gap_after_indices`; the trainer rejects a dataset carrying any such gap before feature generation. This avoids both wasting rolling warm-up rows after normal weekend closures and silently learning across a multi-month outage.

Example loader and split preparation:

```python
from pathlib import Path

from backend.learning.data_sources import (
    load_market_dataset,
    chronological_splits,
)

dataset = load_market_dataset(
    Path.cwd(),
    "exness_xauusdm_m15",
    allow_research_training=True,  # explicit opt-in: candidate_only source
)

splits = chronological_splits(
    dataset,
    label_horizon_bars=YOUR_APPROVED_LABEL_HORIZON,
    embargo_bars=YOUR_APPROVED_EMBARGO,
)

print({
    "dataset_sha256": dataset.sha256,
    "bars": len(dataset.bars),
    "missing_intervals": dataset.missing_interval_count,
    "train_bars": len(splits.train.bars),
    "validation_bars": len(splits.validation.bars),
    "reserved_test_bars": len(splits.test.bars),
})
```

Set the label horizon and embargo from an approved target/feature contract;
the bridge deliberately does not invent a prediction target. Training windows
must be built within each partition's `segments` so no sequence crosses a
missing-candle boundary. The final test partition is reserved for one final
out-of-sample evaluation and must not be used for tuning or model selection.

The Exness export SHA does not match the separately frozen Wave3 benchmark and
must never replace that benchmark. The Binance five-year snapshot contains a
reported one-hour gap; the loader preserves and reports it instead of filling
it with a synthetic candle. Binance JSON numbers are parsed as Decimal to
preserve the decimal tokens stored in the file; this cannot restore precision
not present in the source snapshot.

## Integration

Install compatible dependencies in the backend environment:

```bash
pip install "SQLAlchemy>=2.0,<3" "fastapi>=0.100" "pydantic>=2"
```

Configure `DATABASE_URL` using a PostgreSQL driver, for example:

```text
postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
```

Initialize the learning tables through the project's Alembic migration workflow.
For a local development smoke test only, `LearningBase.metadata.create_all(engine)`
may be used; production schema changes should use migrations.

Mount the router in the existing FastAPI application:

```python
from backend.learning.api import router as learning_router
app.include_router(learning_router)
```

If the project uses a different package root, adjust only this import path.

## API

- `GET /learning/health`
- `POST /learning/experiences`
- `GET /learning/performance?strategy_id=...&environment=paper`
- `POST /learning/models/candidates`
- `POST /learning/models/{model_id}/approve`

Experience `event_id` is unique for idempotent ingestion. Send a stable ID
from the originating trade/agent event. `pnl_pct`, `risk_pct`, and
`drawdown_pct` are percentage-point values (e.g. 1.25 means 1.25%, not 0.0125).

## Promotion policy

A candidate remains non-active until an authenticated human approver invokes
the approval endpoint. The service requires at least 100 validation samples,
win rate >= 50%, profit factor >= 1.10, and validation maximum drawdown <= 8%.
These are initial policy defaults, not evidence of strategy profitability.
Approval changes metadata only; a separate reviewed deployment workflow must
be designed before any model can affect an agent.

**RBAC fail-closed behavior:** `require_learning_approver` returns HTTP 503 by
default. The host application must override this exact dependency with its
authenticated principal/role check before enabling approval. The approver ID
is derived from that trusted dependency, never from a client-supplied request
body. Do not expose the approval route until the override is installed and
tested against the host's real RBAC implementation.

## Legacy retrainer warning

Do not enable the archived `auto_retrain.py` from the downloaded Source1 ZIP.
It trains from `torch.randn()` tensors, assigns hard-coded validation scores,
and copies candidates to `best` without real out-of-sample evaluation. That
code is not part of this Learning Engine and is not an eligible training path.

## Known v0.1 limitations

- No model training algorithm, approved feature/label contract, feature store,
  drift detector or model artifact loader yet.
- Core API integration, actual Alembic migration and LangGraph event wiring are
  pending host-repository inspection.
- Full-repository CI and training on the imported data are not claimed until
  PR #197 integrity checks pass and a target/feature contract is approved.
- Profit factor and validation metrics must come from a reproducible,
  chronological out-of-sample evaluation. Never calculate them from training
  data or mix paper and live results.
