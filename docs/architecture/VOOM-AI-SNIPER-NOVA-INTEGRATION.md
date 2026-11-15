# VOOM AI Sniper ↔ NOVA Integration Contract

**Status:** Draft architecture contract; not a runtime integration or release approval.  
**Target repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Baseline:** `main@6e8d390ac45187fb70b6acb23f1e428a20ca7006`  
**Related source repository:** `vutting895/Voom-ai-sniper`

## 1. Decision

NOVA remains the canonical application, identity boundary, market-data control plane, strategy registry, risk authority, audit system, and future execution authority. VOOM AI Sniper is an isolated strategy/research module consumed by NOVA through a versioned internal contract. It must not become a second broker gateway or a parallel customer application.

## 2. Reuse existing NOVA infrastructure

Use the existing components; do not duplicate them:

- Tenant-isolated Exness MT5 Demo Read-only Bridge under `integrations/mt5-readonly-bridge/`.
- Authenticated Cloudflare MT5 Relay and NOVA System Integration Hub.
- Existing Hub connection/account/quote routes and canonical owner/tenant binding.
- Existing Wave3 + SMC + XGBoost + PyTorch LSTM research pipeline and causal Elliott engine as they are reviewed and accepted.
- NOVA's Quant Engine experiment identity, dataset provenance, split and quality contracts when available on an accepted base.

The Sniper repository's PR #2 (draft, based on an older Sniper main) contains a separate loopback adapter and temporary Quick Tunnel approach. Do not transplant or activate that adapter: NOVA already has a tenant-scoped outbound WSS relay. PR #1 is an older market-data foundation and is not an authoritative replacement for NOVA's Hub.

### Existing NOVA workstream dependencies (checked 2026-11-07)

The integration must coordinate with these existing Draft PRs rather than creating parallel services:

- **PR #243 — Exness H1 history / NOVA Gold Lab notebook** (`57fac9efa508278d9766fa7b8ff8a540def4d5e8`): candidate bounded authenticated `GET /api/history` path via the existing Windows read-only bridge and Cloudflare Relay, plus notebook ingestion/coverage checks. This is the intended market-data ingestion path once exact-head checks and authenticated terminal end-to-end evidence pass. It is not yet an accepted production feed.
- **PR #246 — Redis/Celery SMC + Elliott async runtime** (`f56024ff21dfae75faa7a970ae58ed26b7f88108`): candidate internal worker for closed-bar analysis, tenant-scoped ephemeral state and result retrieval. Its task dispatcher is not a public API and does not replace NOVA's authenticated host adapter, durable authorization, PostgreSQL lineage, or outbox.
- **PR #238 — Exness XAUUSDm H1 dataset** (`71cc20a14a1b4c42587aaa3285d4f6ee1d20848b`): remains blocked because the historical segment is incomplete. Do not train or claim model readiness from this dataset until a separately verified export restores coverage and its manifest/validator pass.
- **PR #245 — Quant Engine foundation**: candidate dataset identity, split, experiment fingerprint and schema-validation contracts. Reuse only after exact-head verification and acceptance; do not reimplement competing experiment identity in Sniper.

At the time of this check, PRs #243, #246, #238 and #247 are Draft/open, based on main `6e8d390ac45187fb70b6acb23f1e428a20ca7006`. Their existence does not imply runtime acceptance. Verify their current exact heads and checks again before depending on or stacking implementation work.

## 3. Source-code disposition

The chat-generated prototype files are not production-ready and must not be copied as-is:

- `ai/indicators.py`: indicator semantics and warm-up/zero-loss behavior need deterministic tests and alignment with NOVA feature definitions.
- `ai/elliott_wave.py`: centered pivot windows can expose future bars; replace with the causal, closed-bar confirmation semantics used by NOVA's accepted Elliott engine.
- `ai/demand_supply.py`: future-candle inspection introduces look-ahead; implement causal SMC/zone state only.
- `ai/sniper.py`: the Wave 2/Wave 4 heuristic is not a validated entry rule; consume versioned strategy features and explicit gates instead.
- `trading/alpaca.py`: do not connect this order-capable adapter to NOVA. Alpaca is not the selected Exness Demo source, and NOVA order/execution/live-trading capabilities remain disabled.

No strategy module may call a broker, select a tenant/account/route, read credentials, or submit/cancel/modify orders.

## 4. Data contract

The strategy adapter receives data only from authenticated NOVA server-side services. It must not accept a caller-supplied broker URL, tenant ID, account ID, or raw credential.

Required input envelope:

- Exact terminal symbol and timeframe from the authenticated NOVA connection.
- UTC, strictly increasing, unique bar timestamps.
- OHLC values with valid bounds; decimal precision preserved.
- Genuine MT5 `tick_volume` as an integer with explicit semantics; never relabel it as exchange volume.
- Spread and provider/source timestamp where available.
- Closed bars only for deterministic feature and signal generation.
- Freshness and coverage metadata; stale, incomplete, malformed or contradictory input fails closed.

NOVA derives owner and tenant from the verified session and trusted connection registry. The strategy receives only the minimum authorized data slice and opaque run context.

## 5. Versioned signal output

Publish a typed, immutable `nova.strategy-signal.v1` result containing:

- `schema_version`, `strategy_id`, `strategy_version`, `run_id`
- `symbol`, `timeframe`, `bar_closed_at_utc`, `generated_at_utc`
- `decision`: `BUY_CANDIDATE | SELL_CANDIDATE | HOLD | REJECTED`
- `confidence` only when calibrated and supported; otherwise omit it
- `reason_codes` and human-readable evidence references
- `feature_version`, `model_version`, `config_hash`, `dataset_sha256`
- `data_freshness`, `coverage_status`, and deterministic rejection reasons
- Optional research levels (entry hypothesis, invalidation, stop/target hypothesis) clearly marked as non-authoritative research outputs

A signal is a research proposal, not an order, risk approval, broker instruction, or execution authorization. NOVA's server-side Risk Engine independently evaluates any future typed proposal. AI/model output cannot override policy or authorize itself.

## 6. Execution and safety invariants

For this integration:

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No broker order, position modification, transfer or withdrawal methods.
- No Alpaca/IBKR/CCXT execution adapter added by this work.
- No secrets, account identifiers, tenant tokens or broker credentials in source, prompts, logs, fixtures or artifacts.
- No production migration, Worker deployment, broker-route provisioning, model promotion or live activation.

## 7. Acceptance gates before implementation can be called integrated

1. Recheck current NOVA main SHA, dependency PR exact heads, required checks and review threads before each dependent change.
2. Accept the authenticated read-only history contract and prove owner/tenant binding end-to-end; do not use notebook/worker inputs supplied by an untrusted caller as authorization.
3. Accept the internal async runtime and its real Redis/Celery round-trip tests before dispatching Sniper analysis to it; preserve durable PostgreSQL lineage and idempotency as separate requirements.
4. Add schema validation and deterministic serialization/hash tests for `nova.strategy-signal.v1`.
5. Add unit tests for OHLC validation, UTC ordering, closed-bar-only behavior, no-lookahead pivots, SMC causality, warm-up handling and decimal precision.
6. Add API contract tests proving only the authenticated NOVA service can invoke the strategy adapter and tenant context cannot be caller-forged.
7. Add stale-data, incomplete-coverage, duplicate-run/idempotency and fail-closed tests.
8. Verify the integration consumes the canonical NOVA market-data service; do not create another MT5/Cloudflare tunnel.
9. Run exact-head CI and review all changed files. A workflow conclusion without executed steps/logs is not a pass.
10. Keep training blocked until the Exness XAUUSDm H1 historical gap is recovered from a verified source and the dataset manifest passes. Do not synthesize missing bars or tune the sealed Final OOS.

## 8. Implementation sequence

- **Slice A — Contract:** accept this boundary and signal schema.
- **Slice B — Data adapter:** consume the accepted NOVA authenticated history service; do not add a second bridge.
- **Slice C — Analysis adapter:** call accepted causal SMC/Elliott workers using closed bars and opaque authenticated run context; add Sniper-specific logic only as a versioned, broker-agnostic strategy package.
- **Slice D — Signal persistence/API:** validate and persist immutable signal evidence with tenant scope, idempotency and provenance; keep model confidence absent until calibrated.
- **Slice E — Research UI:** expose signal history, evidence, data freshness and rejection reasons in the existing NOVA Strategy workspace.
- **Slice F — Validation:** run reproducible walk-forward/backtest and compare against the frozen baseline; no model promotion without the existing acceptance gates.

This document establishes the integration boundary only. It does not claim the Sniper runtime is connected, data is flowing, a model is trained, or a signal is production-ready.
