# NOVA Backtest & Strategy Lab

Status: architecture contract + UI configuration preview. A full strategy simulation engine is not yet implemented.

## Current repository truth
- The authenticated `POST /api/backtest` route validates OHLC and forwards it to the NOVA Worker.
- The current contract accepts 3–120 candles and computes a buy-and-hold baseline only.
- The Backtest UI must never label this baseline as a Wave3, SMC, XGBoost, or Neural Network strategy backtest.
- The new Strategy Lab controls are configuration preview only; they are not persisted and do not submit a strategy job.

## Target architecture
1. **Read-only data adapters**: Exness Demo MT5 OHLCV and explicitly labelled Binance public OHLCV. Normalize symbol, timeframe, timezone, finalized candle status, provider timestamp, spread points, and dataset hash.
2. **Dataset validator**: reject duplicate/reversed timestamps, impossible OHLC, missing/ambiguous intervals, stale bars, symbol/timeframe mismatch, and unfinished candles. Session gaps require an explicit broker calendar policy; never synthesize candles.
3. **Strategy adapters**: Wave3/Fibonacci, SMC (BOS/CHoCH/OB/FVG), XGBoost comparator, and PyTorch LSTM candidate. Each emits versioned, timestamped research signals only.
4. **Event-driven simulator**: consume only information available at each bar close; simulate next-bar execution assumptions, position sizing, stop/target, partial fills, and deterministic handling when stop and target are both touched in one candle.
5. **Transaction-cost model**: spread in symbol points, commission, swap/financing, slippage and execution delay. Report gross and net metrics separately. Missing cost inputs make a result incomplete, never zero-cost by default.
6. **Evaluation**: chronological purged walk-forward with at least five folds; freeze Final OOS and keep it untouched until all tuning/calibration is complete. Compare against buy-and-hold and frozen simple/XGBoost baselines.
7. **Immutable result ledger**: experiment id, config hash, dataset hash, model/artifact hash, feature-manifest hash, code commit, run timestamps, fold metrics, trade ledger, equity/drawdown series, warnings and reviewer status.
8. **UI**: configuration, data provenance, execution/cost assumptions, run state, results overview, equity/drawdown, trade ledger, fold comparison, model diagnostics and evidence export.

## Required metrics
Closed trades, win rate, average win/loss, expectancy, gross/net P&L, net return, profit factor, max drawdown, exposure, turnover, Sharpe/Sortino with explicit sampling assumptions, and cost breakdown. Model diagnostics include Brier score, expected calibration error, confusion matrix, and baseline comparison. Every metric must include sample size and evaluation window.

## Promotion gates
- At least 30 closed Final OOS trades for strategy-level acceptance.
- Positive net profit after realistic costs and profit factor > 1.0.
- At least five walk-forward folds; no tuning on Final OOS.
- Model performance exceeds frozen baseline and calibration is reported.
- Data, feature, artifact, and code provenance are reproducible.
- Independent review and shadow-only runtime verification before production inference promotion.

## Safety invariants
- Read-only market data only.
- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- No broker order, modify, close, transfer, withdrawal, or account-setting methods.
- No automatic promotion based on one metric or a UI label.
- Missing/stale data, unmeasured costs, model mismatch, or failed validation means abstain / mark incomplete.

## Delivery sequence
1. Deliver UI and architecture contract.
2. Implement typed backtest job API and server-side validation.
3. Implement deterministic event-driven simulator and cost model.
4. Persist immutable run manifests and owner-scoped results.
5. Add purged walk-forward evaluation and independent baseline comparison.
6. Test lookahead, gap handling, stop/target ambiguity, costs, tenant isolation, cancellation, idempotency and reproducibility.
7. Enable shadow-only evaluation after review; do not add broker writes.
