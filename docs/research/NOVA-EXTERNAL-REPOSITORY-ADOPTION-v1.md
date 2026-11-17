# NOVA v1.0 External Repository Review and Adoption Plan

**Status:** Research complete; selective adoption plan only  
**Target repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Reviewed main SHA:** `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`  
**Working branch:** `research/external-repo-adoption-v1`  
**Trading safety:** Analysis only. `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

## 1. Decision

Do not replace NOVA with an external trading bot and do not merge a complete external repository. Keep NOVA as the canonical system. Adopt design patterns and, only after code-level review and tests, small isolated components.

The current NOVA main already contains:
- `integrations/mt5-readonly-bridge/` and `integrations/mt5-readonly-proxy/`
- `integrations/mt5-bridge-relay/`
- `integrations/nova-ai-worker/` with deterministic research-intent classification
- `shared/nova-intent-envelope.schema.json`
- `shared/schemas/risk-decision.schema.json`
- `integrations/nova-ai-worker/intent-contract.test.mjs` and bridge/worker tests

Therefore, avoid adding a second MT5 read-only bridge, a second generic intent envelope, or a parallel risk service without first proving a concrete gap.

## 2. Repositories reviewed

| Repository | License observed | Relevant strengths | Decision |
|---|---|---|---|
| [Dev-Art-Solutions/MT5-Execution-Bridge](https://github.com/Dev-Art-Solutions/MT5-Execution-Bridge) | MIT | Durable signal IDs, SQLite persistence, idempotency, dry-run, strict validation order, MT5 state reconciliation, fake-MT5 tests | **Adopt patterns; inspect code for selective reuse only** |
| [vrd07/Quant_Trading](https://github.com/vrd07/Quant_Trading) | MIT | XAUUSD research, regime-gated strategies, risk veto, walk-forward/backtest tooling, MQL5 bridge examples | **Use as research/reference; do not import whole system** |
| [michiTrader/tradetropy](https://github.com/michiTrader/tradetropy) | MIT | Common Strategy API for backtest/live/replay, tick/candle simulation, order-flow/footprint, Monte Carlo robustness | **Evaluate as optional research dependency; no immediate runtime dependency** |
| [harshatangirala/smc-ict-research](https://github.com/harshatangirala/smc-ict-research) | MIT | Formalized SMC/ICT concepts, matched random-entry baseline, multiple-hypothesis control | **Adopt research discipline, not strategy code as a presumed edge** |
| [MooreSi/forex-gold](https://github.com/MooreSi/forex-gold) | AGPL-3.0 | XAUUSD-specific engines, deterministic risk governor, signal lifecycle, EA-native trade management | **Do not copy code into NOVA without an explicit AGPL compliance decision** |
| [Spirax-M1/algorithmic-trading-ml](https://github.com/Spirax-M1/algorithmic-trading-ml) | Not independently verified in this review | LSTM + XGBoost ensemble, walk-forward evaluation, multi-timeframe feature alignment | **Reference only; claims and code require further verification** |

License status is based on the repository LICENSE file or README at the time of review. Re-check upstream licenses and notices immediately before copying any code.

## 3. Detailed findings and NOVA fit

### A. MT5 Execution Bridge — strongest execution-safety reference

Repository: https://github.com/Dev-Art-Solutions/MT5-Execution-Bridge

Observed design:
- FastAPI receives a structured signal.
- A durable SQLite record stores the signal before processing.
- A unique `signal_id` prevents duplicate submissions across process restarts.
- The worker applies validation and risk checks in a fixed order.
- Dry-run is the default and stops before `order_send()`.
- Ambiguous broker outcomes become review-required; the bridge does not blindly retry.
- A failed MT5 state query is treated as unknown/failure, never as zero exposure.
- Unit tests cover idempotency, broker-day state, account namespacing, symbol mapping, volume calculation and validation.

NOVA fit:
- NOVA already has a Cloudflare read-only relay and a Windows MT5 read-only bridge. Do not replace them with this local execution server.
- Reuse the concepts when a separately approved Demo-execution phase is designed: persistent intent IDs, explicit lifecycle states, fail-closed validation, broker/account namespacing, order reconciliation and fake-MT5 tests.
- Keep any future order-capable adapter physically and logically separated from the existing read-only bridge.
- Do not add Python MetaTrader5 SDK calls to Cloudflare Workers; the SDK requires a reachable desktop MT5 terminal environment.

Required NOVA tests before any future execution work:
1. Replayed intent ID is rejected as duplicate, including after worker restart.
2. Unknown MT5 positions/account/time state blocks the request.
3. Broker server day, account and broker server are part of the daily-risk key.
4. Partial fills and ambiguous send results are persisted and reconciled; never blind-retried.
5. Invalid/stale quote, symbol, stop, spread, volume or risk inputs fail closed.
6. Dry-run traverses all validation steps but cannot submit an order.

### B. Quant_Trading — closest XAUUSD strategy/risk research reference

Repository: https://github.com/vrd07/Quant_Trading

Observed design:
- 13 independent strategies, including SMC order blocks/FVG, Fibonacci golden zone, VWAP, momentum and regime-oriented strategies.
- A 16-step risk engine is described as having veto authority over orders.
- Regime classification uses RandomForest with a Markov smoother and daily strategy-weight updates.
- The repository includes walk-forward/backtest modules, strategy tests, risk tests, and MQL5 bridge examples.
- Its README documents that several legacy strategies were retired after failing a walk-forward deploy gate.

NOVA fit:
- Use the strategy catalog as a checklist for research coverage, not as a request to add 13 more strategies.
- Compare only XAUUSD-compatible strategy definitions against NOVA's existing SMC, premium/discount, Fibonacci and StrategyEngine30 logic.
- Inspect the actual risk code and tests before adopting any individual function.
- Preserve NOVA's own OOS rules and frozen gates. Never import reported performance numbers as evidence for NOVA.
- Exclude all non-XAUUSD strategy configurations from the v1.0 runtime.

### C. Tradetropy — backtest/replay evaluation candidate

Repository: https://github.com/michiTrader/tradetropy

Observed design:
- Same Strategy API is intended for backtest, live and replay.
- Candle/tick backtesting, realistic order simulation, MT5 adapter, order-flow/footprint tooling and Monte Carlo robustness are provided.
- MIT license is present in the repository.

NOVA fit:
- Evaluate in a disposable research environment, not in the production runtime.
- Compare fill assumptions, spread/slippage, replay determinism, tick handling and metrics against NOVA's current backtest engine.
- Adopt only if a reproducible benchmark shows a material advantage and the dependency does not duplicate NOVA functionality.
- Do not enable its live adapter.

### D. SMC/ICT Research — important negative evidence

Repository: https://github.com/harshatangirala/smc-ict-research

Observed result:
- The study formalizes 44 SMC/ICT concepts and tests 352 concept/horizon hypotheses.
- Its reported primary matched-null test found no concept statistically outperforming random entry across the tested horizons.

NOVA fit:
- Use this as a warning against assuming that BOS, FVG, order blocks or other SMC labels imply predictive edge.
- Re-test NOVA's own exact definitions on XAUUSD with realistic spread/slippage, matched random-entry baselines, multiple-testing control and untouched OOS data.
- This result is not proof that SMC cannot work on XAUUSD; the study's universe and data are different.

### E. FOREX Trader — architecture reference only due AGPL-3.0

Repository: https://github.com/MooreSi/forex-gold

Observed design:
- XAUUSD-first application with breakout and reversal engines.
- Shared signal bus, pre-trade gates and a deterministic risk governor.
- The README explicitly labels illustrative dashboard metrics as sample data and makes no performance claim.
- LICENSE is GNU AGPL version 3.

NOVA fit:
- Its separation of signal generation, risk approval, execution and position management is useful as an architecture reference.
- Do not copy, adapt or link code into NOVA until legal review determines whether AGPL obligations are acceptable for NOVA's server-side distribution/deployment model.
- Do not copy its live-trading settings or execution path.

### F. LSTM + XGBoost reference — research only

Repository: https://github.com/Spirax-M1/algorithmic-trading-ml

Observed README describes an LSTM feature extractor combined with XGBoost, weighted ensemble voting, multi-timeframe features and walk-forward validation. The README also reports performance figures, but this review did not independently reproduce them or validate the underlying data, code quality, license or test coverage.

NOVA fit:
- Compare its feature alignment and temporal validation approach with NOVA's own training pipeline.
- Do not import reported accuracy, Sharpe or profit-factor values into NOVA's evidence.
- Do not adopt its TensorFlow/Python 3.12 stack without a compatibility review against NOVA's Python 3.11 target.

## 4. Selective adoption backlog

| Priority | NOVA work item | Source/reference | Acceptance evidence |
|---|---|---|---|
| P0 | Audit existing intent/bridge contracts for durable unique IDs and duplicate handling | MT5-Execution-Bridge patterns | Tests prove replayed IDs cannot create duplicate work |
| P0 | Fail-closed MT5/account/broker-clock state validation | MT5-Execution-Bridge patterns | Unknown state blocks; account and broker-day isolation tests pass |
| P0 | Formalize future Demo execution lifecycle separately from read-only bridge | MT5-Execution-Bridge patterns | State machine, threat model, tests; execution remains disabled |
| P1 | Compare current NOVA risk schema and governor coverage against 16-check risk checklist | Quant_Trading | Gap matrix; no duplicated risk engine |
| P1 | Benchmark NOVA backtest fills and robustness against Tradetropy | Tradetropy | Reproducible benchmark on same XAUUSD dataset and assumptions |
| P1 | Add matched random-entry and multiple-testing controls to SMC research | SMC/ICT Research | OOS report with frozen definitions and confidence intervals |
| P2 | Compare LSTM/XGBoost feature fusion and multi-timeframe alignment | Spirax-M1 | Leakage audit, baseline comparison, reproducible walk-forward results |

## 5. Non-goals / prohibited for this integration

- No replacement of NOVA's canonical repository.
- No fork-based replacement of NOVA.
- No copy of AGPL-3.0 code into NOVA without legal approval.
- No direct model-to-order path.
- No live trading, withdrawals, transfers or production execution.
- No changes to `main` and no production deployment from this research branch.
- No adoption of strategy performance claims without independent reproduction.

## 6. Next implementation sequence

1. Compare the current NOVA bridge, intent envelope and risk decision schema against the execution-bridge reference.
2. Produce a concrete gap list; implement only missing safety tests and contract fields.
3. Review Quant_Trading risk/strategy modules individually; select no more than one isolated component per change.
4. Build an offline benchmark for Tradetropy versus NOVA's existing backtest engine.
5. Add SMC matched-null research controls before treating any SMC family as an edge.
6. Open a PR for review. Merge only after tests pass and the user approves.

## 7. Sources

- https://github.com/Dev-Art-Solutions/MT5-Execution-Bridge
- https://github.com/vrd07/Quant_Trading
- https://github.com/michiTrader/tradetropy
- https://github.com/harshatangirala/smc-ict-research
- https://github.com/MooreSi/forex-gold
- https://github.com/Spirax-M1/algorithmic-trading-ml
