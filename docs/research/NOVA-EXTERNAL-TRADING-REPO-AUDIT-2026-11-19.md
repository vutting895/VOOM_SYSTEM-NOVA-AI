# NOVA External Trading Repository Audit — 2026-11-19

## Scope and decision rule

This is a source-selection and integration audit, not a claim that any upstream
repository is secure, profitable, or production-ready. Stars and activity are
discovery signals only. Before copying code, NOVA requires a pinned commit,
license compatibility, source review, reproducible upstream CI evidence,
dependency/security review, data-model compatibility, and NOVA-side tests.

**Decision:** no upstream trading engine or strategy code is imported wholesale.
The reviewed projects have materially different asset classes, broker models,
execution semantics, and/or licensing obligations. The current patch instead
fixes two NOVA ML implementation defects and three causal/backtest defects. The
patch does not enable broker execution.

## Category decisions

| Category | Candidate(s) | Decision for NOVA |
|---|---|---|
| Event-driven trading engine | NautilusTrader | Architecture reference only. Mature and active; LGPL-3.0 requires a deliberate linking/distribution review. Rust/Python event runtime is too large to transplant into the existing Python/Workers boundary. |
| Portfolio / execution engine | QuantConnect LEAN | Architecture reference only. Apache-2.0; strong portfolio, brokerage abstraction and risk concepts. C#/Python engine is not a drop-in MT5/Exness bridge. |
| AI/ML research | Microsoft Qlib | Preferred ML research reference. MIT; use concepts for point-in-time features, experiment orchestration and evaluation, not as a production trade controller. |
| Reinforcement learning | FinRL | Research-only. MIT; RL environment assumptions and reward design need independent validation. Never connect its policy directly to an order endpoint. |
| Crypto strategy framework | Freqtrade | Do not import code. GPL-3.0 and crypto-centric exchange/strategy lifecycle are not compatible with a casual closed-source transplant or Exness MT5 assumption. |
| Tick / order-book backtesting | HftBacktest | Methodology reference only. MIT; queue position, latency and order-book replay are relevant, but its market-data assumptions are not the same as Exness OTC XAUUSD execution. Last inspected commit: `5f3ec40b2afb764e0fea112f941ed85523ef4e88` (2025-12-23); activity freshness is a concern. |
| Backtest analytics | QuantStats | Candidate for a later isolated analytics adapter. Do not use its output as a strategy-validity gate until trade returns, bar frequency, risk-free rate, annualization and missing-period policy are explicitly mapped. |
| Portfolio optimization | skfolio | Candidate for offline risk research only. It does not replace broker-account exposure checks, margin rules, stop-level checks or the NOVA entry lock. |
| Exchange adapters | CCXT | Do not use for MT5. It unifies crypto exchanges and does not provide Exness MT5 semantics. |
| Vectorized research | vectorbt | Hold. GitHub metadata reported license `NOASSERTION`; legal verification is required before code import. |
| Market-data reliability | JoshKZ/marketdata-reliability-core | Do not import as a trusted dependency yet. Apache-2.0 is declared and documentation is unusually explicit about session-aware gaps, provenance and non-repair. However, repository metadata showed 2 stars, created 2026-09-17, last pushed 2026-09-28, and no independently reproduced NOVA-side test run. Reuse design ideas only pending independent audit. |
| Market-data toolkit | weston-boyd/market-data-toolkit | Hold. MIT was identified, but checked-in `__pycache__` artifacts are a quality warning and no NOVA runtime test was performed. |

## External-source findings

- NautilusTrader: reviewed upstream `develop` license file; LGPL-3.0.
- QuantConnect LEAN: reviewed upstream `master` license file; Apache-2.0.
- Microsoft Qlib: reviewed upstream `main` license file; MIT.
- Freqtrade: reviewed upstream `develop` license file; GPL-3.0.
- HftBacktest: reviewed upstream license file; MIT.
- The earlier GitHub metadata snapshot showed active recent development for NautilusTrader, LEAN, Qlib, FinRL and CCXT. These signals do not replace source-level security review or reproducible CI.
- No third-party source files were copied into NOVA in this patch. No third-party package was added to runtime dependencies.

## NOVA code findings addressed on this branch

1. `workers/quant_engine/training.py` returned hard-coded mock checkpoint bytes and a fixed validation loss. Replaced with a deterministic, CPU-first PyTorch training loop, input/digest validation, early stopping, best-weight restoration and an in-memory SHA-256 checkpoint.
2. `workers/quant_engine/torch_models.py` did not implement residual blocks despite the public model name and had an invalid no-PyTorch fallback base class. Replaced with explicit residual blocks and an import-safe optional-dependency fallback.
3. `workers/quant_engine/smc_mean_rejection_backtest.py` marked centered-window swing pivots at the pivot bar, leaking future bars. Pivot events now become available only at the right-side confirmation bar.
4. The same backtest called `searchsorted` on a Python list, which has no such method. It now retains the pandas index.
5. The same backtest considered the last ten order blocks from the entire future dataset. It now filters order blocks to timestamps at or before the current entry bar.
6. Intrabar OHLC ambiguity previously awarded a target when stop and target could both have been touched. The simulation now assumes stop-first and does not award TP2 when a single bar also spans TP1.

## Known unresolved blockers

- The SMC mean-rejection script still defaults to a Yahoo Finance BTC symbol in its configuration. It is **not** an approved XAUUSD/Exness backtest and its results must not be used for NOVA strategy acceptance.
- The script still needs explicit spread, commission, slippage, contract-size, tick-value, financing and broker-session models before it can represent Exness XAUUSD.
- The strategy script's external data download path is not a historical tick-quality source. The NOVA raw tick audit remains separate; the observed M1 gaps must be classified against an explicit broker trading calendar and source provenance.
- The existing risk prototype is not a broker-derived account-wide risk engine. Its snapshot inputs are not proof of current MT5 exposure, margin, pending orders or server-side constraints.
- Meta Decision Layer accepts calibration claims and prediction histories as inputs; a trusted evaluator must verify those artifacts, their dataset identity, OOS boundaries and fold provenance before the candidate can be considered evidence-backed.
- PyTorch is not part of the current core `workers/requirements.txt`. The training function now fails explicitly when PyTorch is absent. A separately pinned ML runtime and an actual PyTorch CI run are still required.
- No tests, build, deployment, broker connection, database migration or training run were executed by this remote source-edit operation.

## Release and safety

- Changes are isolated on `audit/integrate-verified-trading-primitives-20261119`.
- Target base is the verified `main` SHA `977bf4e7c74c28ca4971797986c7992e5b32c019`.
- Live trading remains OFF. `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false` must remain enforced.
- No PR is considered accepted until exact-head CI, focused Python tests, frontend build/lint where relevant, and independent review complete.
