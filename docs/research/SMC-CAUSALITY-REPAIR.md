# SMC causal repair — Phase 2

## Findings in the legacy backtester

The existing `smc_mean_rejection_backtest.py` is a BTC-USD/yfinance prototype (1H-derived 4H bias and 5M entries), not an XAUUSDm backtester. It must not be used to score the Exness XAUUSDm M15 candidate dataset.

Three direct look-ahead paths were identified:

1. `find_swing_points` marks a pivot on its historical center bar after examining `lookback` bars to the right. The resulting historical marker is visible before the confirmation bars existed.
2. `detect_order_blocks` constructs the full-history OB list before the entry loop. The later use of `obs[-10:]` exposes future OBs to earlier decisions.
3. HTF selection uses the latest 4H bar whose open timestamp is before the 5M timestamp. That bar may still be forming; its eventual close/trend is therefore leaked into earlier entries.

A further execution flaw was found: the session filter `continue` runs before open-position management, so stop/target checks are skipped outside the entry session. Same-bar SL/TP ambiguity is also resolved optimistically in the legacy code.

## Changes in this branch

- Added `workers/quant_engine/causal_smc.py`, a standard-library-only causal event layer.
- Refactored the legacy script's swing markers to appear only at the right-side confirmation bar, not at the historical pivot.
- Prevented repeated BOS/CHOCH events from the same already-broken swing level.
- OB entries are filtered by their structure-break timestamp; future OBs are excluded from earlier decisions.
- HTF selection uses the full 4H close timestamp and excludes incomplete 4H aggregates.
- Session restrictions now gate entries only; open trades continue to be checked for exits outside the entry session.
- If stop and target are both touched inside one OHLC bar, the legacy simulation now assumes stop-first (conservative).
- Added eight standard-library unit tests covering confirmation timing, future-data invariance, duplicate breaks, OB visibility and HTF close alignment.
- Windows validation: 8/8 causal unit tests passed; legacy script passed `py_compile`. This is not a full repository test run or a market backtest.

## Data QA checkpoint

The reproducible validator `scripts/research/qa_exness_xauusdm_m15.py` was run on the actual Windows-downloaded Git LFS object against the PR #197 manifest. It returned `PARTIAL_PASS`: all byte/hash/schema/row/timestamp/OHLC/numeric/spread-tolerance checks passed, while 61 non-standard timestamp intervals remain pending exact broker-calendar reconciliation. The summarized evidence is stored in `docs/research/EXNESS-XAUUSDm-M15-DATA-QA.json`.

The Exness Demo XAUUSDm M15 Git LFS object was downloaded on the paired Windows agent to a temporary directory. Actual bytes verified:

- Bytes: 8,584,488
- SHA-256: `7d16e54327bfeabe9bd2c416548ee378f2bdb173827a494af7a7458c113c99d7`
- Rows: 101,076
- UTC range: 2022-07-21 00:00 through 2026-10-29 16:45
- Schema: 10 expected columns
- Duplicate/out-of-order timestamps: 0
- Invalid OHLC / non-finite / negative volume or spread: 0

Gap interpretation is not yet closed. 845 intervals of 75 minutes and 200 intervals of 2,955 minutes repeat at the expected daily/weekly closure boundaries in this export. There are 61 other non-standard intervals that require reconciliation against the Exness historical session/holiday calendar before calling the series complete. A naive 15-minute arithmetic gap count would incorrectly classify scheduled market closures as missing candles.

The 19 exact spread formula mismatches are floating-point representation noise: maximum absolute difference is (1\times10^{-16}) against `spread_price = spread_points * 0.001`; all pass a (1\times10^{-12}) tolerance. `volume` equals `tick_volume` for all rows and `real_volume` is zero for all rows, consistent with tick-volume-only CFD history; do not describe this as exchange traded volume.

## Remaining Phase 2 gates

- The causal primitives have eight passing unit tests. The legacy script was patched for causal swings, one break per swing level, as-of OB visibility, completed 4H alignment, complete 4H aggregates, entry-only session filtering, and stop-first same-bar resolution. The legacy script passed syntax compilation; no end-to-end run was possible because pandas/NumPy are not installed on the paired Windows agent.
- A complete cost-inclusive XAUUSDm runner is still required. The candidate data is M15; the legacy strategy requests 5M entries. Do not resample M15 into synthetic M5 or silently substitute M15 entries and claim equivalence. Obtain XAUUSDm M5/tick data or explicitly define and validate a separate M15-entry strategy variant.
- The legacy position-sizing formula assumes one unit of exposure per price unit. It is not valid for XAUUSDm without applying the instrument's contract size (100), tick size/value, minimum lot, lot step, and account-currency conversion.
- Cost model must consume per-bar spread, commission, slippage and swap/rollover rules; the current prototype has no cost model despite spread fields being present in the candidate CSV.
- Partial TP behavior, end-of-data open positions, and session/holiday handling require deterministic conservative rules. A 5M strategy cannot be approved using only M15 OHLC.
- Only after the data calendar and complete causal/cost-inclusive XAUUSDm runner gates pass may the optimizer compare ACA/PSO/GA/Random on market data.

## Safety

Research-only. No broker connection, order submission, live trading, account writes, model promotion or production deployment.
