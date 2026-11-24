# NOVA Frontend / Datacenter Integration — Current Truth

Last updated: 2026-11-24

## Ownership boundary

- NOVA owns the frontend, Supabase session, NOVA Remote MCP Gateway, AI Provider Gateway, Knowledge service, Trading Research boundary, MT5 read-only broker boundary, risk controls, and trading safety.
- Datacenter owns Dataset Registry, data quality, Learning Universe, analysis, training orchestration/runtime, Model Registry, model evaluation, backtesting, walk-forward research replay, and research-run persistence.
- Browser clients call the existing NOVA Remote MCP Gateway. The Gateway forwards the authenticated Supabase session to the single Datacenter MCP endpoint at `/mcp`. No second MCP server and no browser-direct Datacenter endpoint are allowed.
- Deployment is paused. The Datacenter endpoint and authenticated end-to-end connection have not been verified.

## Current frontend integration

The following frontend views now read/write Datacenter-backed state through `src/api/mcpClient.ts` and `src/services/datacenterResearchService.ts`:

- `LearningUniverseView.tsx`: Dataset Registry, Universe Registry, Model Registry, and explicit training-job submission/status/logs.
- `TradingIntelligenceView.tsx`: persisted Model Registry records only. It no longer reports hard-coded model accuracy, latency, ensemble confidence, or mock model states.
- `BacktestSimulatorView.tsx`: selects an exact approved Dataset version and an explicit signal column; runs Datacenter signal replay or evaluation-only walk-forward replay; reads persisted research history.

Legacy services were redirected:
- `src/services/modelService.ts` now delegates to Datacenter registry and training methods.
- `src/services/backtestService.ts` now delegates to Datacenter research tools; Firebase/Firestore is no longer a second owner of backtest history.
- `src/api/apiClient.ts` no longer exposes legacy Intelligence, Learning Universe, Backtest, or symbol-only Auto-Train methods.

Legacy local server endpoints are retired with HTTP 410:
- `GET /api/intelligence/models`
- `POST /api/backtest/run`
- `GET /api/learning/universe`
- `GET /api/auto-train/status`
- `POST /api/auto-train/trigger`

Use the existing NOVA Remote MCP Gateway tools instead:
- Dataset: `dataset_list`, `dataset_get`, `dataset_ingest`, `dataset_approve`, etc.
- Universe: `universe_list`, `universe_get`, `universe_register`.
- Training: `learning_submit`, `learning_status`, `learning_logs`.
- Models: `model_list`, `model_get`, `model_evaluate`, `model_approve`.
- Research: `backtest_run`, `walk_forward_replay`, `research_run_get`, `research_run_list`.

## Datacenter research runtime — implemented scope

`signal_replay_v1`:
- Consumes one exact PASSED + explicitly approved dataset version.
- Requires an explicit signal column in that dataset schema.
- Signal at bar i is executed no earlier than bar i+1 open.
- Includes fixed exposure sizing and configurable commission, half-spread, and slippage.
- Supports opposite-signal exit, max-holding exit, and end-of-data close.
- Persists immutable, owner-scoped research runs.

`walk_forward_signal_replay_v1`:
- Evaluates precomputed signals in non-overlapping chronological OOS windows.
- Uses explicit context-window, purge-gap, test-window, and step parameters.
- Persists fold results and input lineage in one immutable run.
- Does NOT refit/retrain models or regenerate signals per fold. It is not full model walk-forward training.

Explicit limitations: no stop-loss/take-profit, intrabar path modelling, partial fills, funding/swap, dynamic spread, market impact, multi-position portfolio, or automatic signal generation. Signal provenance and point-in-time correctness must be independently established. No model approval enables trading.

## Known blockers and unproven items

1. `DATACENTER_MCP_URL` and a production Datacenter host/Tunnel endpoint are not configured or verified.
2. No authenticated NOVA Gateway → Datacenter end-to-end call is evidenced.
3. No two-user tenant-isolation integration proof is available yet.
4. Advanced model families (XGBoost, PyTorch/LSTM, CNN/Vision, GNN, Mamba, continual learning, RL/self-play, etc.) are not yet supported by Datacenter's real training runtime.
5. Full model walk-forward training/refit is not implemented.
6. The Learning and Backtest frontend service migration is implemented in source, but no typecheck/build or consolidated test run has been performed after these changes.
7. Dashboard market overview/candlestick presentation endpoints remain demo/synthetic presentation data and must not be treated as approved training data.
8. Legacy NOVA research prototypes have not yet been deleted; removal is gated on dependency audit and parity evidence.

## Validation and release policy

- Do not claim tests passed until exact current-head test evidence exists.
- Do not deploy while code migration and review are incomplete.
- Run one consolidated validation after API wiring and source migration are complete: Datacenter Python suite, NOVA Worker suite, frontend typecheck/build, MCP contract checks, tenant isolation, and authenticated end-to-end calls.
- Keep Live Trading, broker writes, orders, transfers, and withdrawals disabled.
