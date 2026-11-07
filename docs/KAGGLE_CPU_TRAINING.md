# NOVA Gold Lab — Exness Demo Bridge ingestion and CPU research

The authoritative dataset source is the Exness MT5 Demo terminal running on Windows. The existing tenant-isolated NOVA Read-only Bridge reads genuine MT5 bars; Colab/Kaggle connects to the approved Cloudflare Relay over HTTPS. The notebook does not call the Exness API directly and does not accept broker credentials.

## One-time secret setup

Add these values to Colab Secrets or Kaggle Secrets (never to notebook cells, Git, logs, or chat):

- `NOVA_MT5_BRIDGE_URL`: `https://voom-mt5-bridge-relay.suwapat787.workers.dev`
- `NOVA_MT5_BRIDGE_TOKEN`: the tenant-specific read-only Bridge bearer token
- `NOVA_MT5_TENANT_ID`: the assigned opaque tenant ID

The Windows Bridge must already be running with the intended Exness Demo MT5 terminal. The Relay and Bridge both validate the tenant route and token. The notebook refuses non-HTTPS origins, non-Exness Demo responses, or any response that does not explicitly declare read-only execution flags.

## Data ingestion

The notebook discovers the exact broker symbol from the authenticated terminal, then downloads bounded UTC half-open history chunks through `GET /api/history`. Set `SYMBOL`, `TIMEFRAME`, `START_UTC`, and `END_UTC` in the notebook to the intended values. Supported timeframes are M1, M5, M15, M30, H1, H4, and D1. The Bridge caps each request at 2,000 bars and applies a timeframe-specific maximum range.

The returned dataset retains genuine MT5 `tick_volume`, spread and real_volume. Missing volume is never fabricated. The notebook validates:
- exact symbol and timeframe returned by the Bridge;
- requested UTC interval and date-boundary coverage;
- row count agreement, monotonic timestamps and duplicate absence;
- finite OHLCV values, OHLC bounds, non-negative genuine tick volume;
- unexplained weekday gaps (weekend market closures are expected);
- CSV SHA-256, byte size, row count, source and provenance in `dataset_manifest.json`.

The notebook computes the CSV bytes and SHA-256 in memory before persistence. If gaps or requested-range coverage need review, it refuses to write the Dataset and stops with a validation report. After writing, it recomputes SHA-256 from disk and accepts the Dataset only if the hashes match. No dataset or model weights are committed to Git.

## CPU training boundary

CPU-only XGBoost and a small PyTorch LSTM are research baselines, not profitability claims or trading signals. The notebook hard-caps the history request at `2026-07-01T00:00:00Z` (exclusive). Bars at or after that timestamp are never downloaded into this training run, preserving the sealed final OOS window. Do not move this cutoff to improve model metrics. The final holdout remains chronological and must not be tuned. Model promotion still requires untouched final OOS, walk-forward windows, cost-aware backtests, sufficient trade count, positive net results, PF above 1, baseline comparison and independent risk review.

No broker order endpoint is used. No model is automatically promoted. Live trading remains disabled.

## Bounded market-closure validation

The notebook accepts weekend/holiday closures only when the interval is at most 96 hours. A larger gap is treated as a possible data outage even when it crosses one or more weekends, and the dataset is not persisted or used for training. This prevents a multi-month MT5 history outage from being misclassified as a normal weekend closure.
