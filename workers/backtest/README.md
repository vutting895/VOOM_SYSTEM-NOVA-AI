# Backtest Worker

## Canonical research evaluator

Use `workers/backtest/engine.py` for the current deterministic OHLCV evaluator. It reuses the Quant Engine's OHLCV validation and fingerprint primitives. The older `engine_prototype.py` is retained as historical prototype code and is not the canonical evaluator.

The current adapter is deliberately narrow: EMA crossover, long/flat, unleveraged linear exposure. It is a research evaluator, not a broker simulator and not a production API.

## Required input contract

Every candle must contain:

- `timestamp`: bar-open timestamp, timezone-aware ISO-8601.
- `close_time`: completed bar close timestamp.
- `available_at`: provider publication time at which the completed bar became available.
- `ingested_at`: time the research system actually received the bar.
- `is_closed=true`: explicit completed-bar assertion.
- OHLCV fields validated by `workers.quant_engine.validate_ohlcv`.

A decision is considered usable only after both `available_at` and `ingested_at`. The earliest simulated fill is the first subsequent candle open strictly after that time. In-progress candles, naive timestamps, overlapping bars, out-of-order availability, and malformed OHLCV are rejected. Gap checks use the declared fixed interval; providers with session calendars must supply a calendar-aware adapter instead of silently filling or relabeling gaps.

Market metadata is explicit: source, symbol, timeframe, price basis, quote/account currencies, contract multiplier, quote-to-account conversion rate, expected interval, annualization periods, and whether gaps must be rejected. The current evaluator accepts mid or last price input only.

An explicit cost model is mandatory, with per-side fees, full spread, per-side slippage, and estimated financing bps/day. Zero values are permitted only when deliberately supplied. The run returns both an OHLCV content hash and a lineage-aware dataset hash, plus a deterministic run fingerprint tied to the code revision, strategy, assumptions, and dataset.

## Execution and metric rules

- EMA values use a seeded EMA recurrence; signals are evaluated only after the signal candle is complete.
- Buy/sell fills occur at the next eligible bar open, adjusted adversely for half-spread and slippage.
- Fees apply per side; financing is charged using the declared constant daily estimate.
- Exposure is capped at 100% of available cash; leverage, shorting and margin liquidation are not simulated.
- Returns include cash/equity accounting, bar-close-only max drawdown, annualized Sharpe/Sortino and volatility (using caller-supplied periods/year and a zero risk-free rate), calendar-time CAGR, trade expectancy, profit factor, exposure, and a same-assumption buy-and-hold reference.
- Input is bounded to 250,000 bars per run. Heavy or multi-fold evaluation must be scheduled in the isolated compute plane, not run in request-bound handlers.
- Open positions are liquidated at end-of-data using adverse execution costs. No intrabar stop/target assumptions are inferred from OHLC bars.

## Known limitations / integration gates

This is not yet a tick-accurate Exness MT5, IBKR, or crypto-perpetual simulator. Contract-specific lot rounding, variable FX conversion, margin tiers, market impact, observed broker swap schedules, and timestamped funding cashflows require dedicated instrument and event adapters with tests. The constant financing estimate must not be represented as observed broker cost.

The existing Binance ingestion prototype does not yet preserve all completion, provider-availability and ingestion timestamps required here. It must not be passed directly to this evaluator until the ingestion adapter emits the complete lineage contract and immutable source snapshots. Do not infer market-data correctness from unit tests or synthetic test fixtures.

All outputs are historical research only. No broker credentials, account connections, order-write operations or live-trading capabilities are included. `orders_submitted`, `execution_enabled`, `order_submission_enabled`, and `live_trading_enabled` remain false.

Run the contract tests from repository root:

```bash
python -m unittest discover -s tests -p "test_backtest_engine.py" -v
```
