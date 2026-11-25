# NOVA EA v1.83 — Research Synthesis (YouTube + MQL5)

**Status:** Evidence review for a research-only candidate. This is not a profitability claim or a production approval.
**Target:** Exness XAUUSDm; primary signal chart M15; H1 context; current EA candidate remains compile-time execution-disabled.

## 1. Sources reviewed

### YouTube

- Uncensored Trader, “UT Backtest | Apakah Liquidity Sweep + Struktur Market Bisa Konsisten Profit?” (10 July 2025): https://www.youtube.com/watch?v=LNxp1e_vnlc
  - The video description says the creator tested 100 XAUUSD M1 entries during the morning session from February to July 2025 and displayed entries, win rate, drawdown and a spreadsheet.
  - Evidence limitation: the indexed description does not expose the raw trade log, broker tick data, cost model, or reproducible code. Treat it as a hypothesis and an example of rule-based testing, not proof of a persistent edge.
- Uncensored Trader, “UT Backtest | Liquidity Run 300% More Profitable Than Liquidity Sweep?! I Prove It!” (12 July 2025): https://www.youtube.com/watch?v=sSr3QHSHDqw
  - The description reports a 100-entry XAUUSD M1 comparison and a spreadsheet. “300% more profitable” is the creator's headline, not independently verified evidence. Do not import the result or parameters without reproducing the test.

### MQL5 / MetaQuotes

- Rana Ali, “SMC Gold: Liquidity Sweep and Order Block EA for XAUUSD M15” (MQL5 CodeBase, 23 September 2026): https://www.mql5.com/en/code/77639
  - The published rule set uses a recent swing sweep, a confirmation close through the sweep candle body, and an H1 EMA(50) trend filter. It documents ATR-based buffers, a minimum stop size, a spread ceiling, and a 2R target.
  - Most important engineering warning: the author reports that a SYMBOL_TRADE_TICK_VALUE sizing assumption caused approximately 10x intended risk on one gold demo server. The corrected implementation uses OrderCalcProfit() to estimate loss at the stop. This candidate already uses OrderCalcProfit() for risk sizing; retain that approach and test it on Exness XAUUSDm / USC and USD account modes.
  - The author's backtest claims are single-author, broker-specific results and are not independently reproduced here.
- “Liquidity Sweep Equal Highs Lows” (MQL5 CodeBase, updated 20 November 2026): https://www.mql5.com/en/code/79401
  - Defines equal highs/lows using confirmed swing points and ATR tolerance; classifies a level as swept only when price trades through and closes back inside. The author explicitly warns that a sweep marks a liquidity event but does not predict direction. Its closed-bar swing confirmation is a useful anti-repaint design principle.
- MetaQuotes, “Testing trading strategies on real ticks” (4 August 2016): https://www.mql5.com/en/articles/2612
  - Demonstrates that trade counts, net profit, win rate and drawdown can materially differ between 1-minute OHLC, generated ticks and real ticks. Use “Every tick based on real ticks” for final validation, not OHLC-only results.
- MQL5 Reference, “Testing Trading Strategies”: https://www.mql5.com/en/docs/runtime/testing
  - Describes real-tick testing and its validation/fallback behavior when tick records do not match minute bars. Record the tester journal's tick coverage; the mode label alone is not proof that every tested minute used genuine ticks.
- “Implementing Walk-Forward Efficiency Ratio Scoring in MQL5 to Detect Over-Optimized Strategies” (9 July 2026): https://www.mql5.com/en/articles/23250
  - Provides a programmatic walk-forward framing: compare out-of-sample performance with in-sample performance rather than selecting on the optimized window alone.

### Contradictory evidence / adversarial checks

- A long-window third-party study of 552 XAUUSD M5 previous-day-high/low sweeps (5 July 2021–11 November 2026) reports -0.08R/trade before costs and -0.44R after costs: https://wicko.ai/strategies/liquidity-sweep/
- A separate pre-registered gold sweep study reports that a candidate with PF 1.13 in its selection window fell to PF 0.14 in its check window: https://proea.app/en/blog/gold-sweep-desk-what-we-measured
- These are not MetaQuotes publications and their datasets/methods require independent audit. They are still useful falsification warnings: a raw sweep reversal is not an adequate strategy, and cost-aware out-of-sample results can reverse an apparently positive result.

## 2. What the evidence supports — and does not support

Supported as implementation hypotheses:
1. Define liquidity events mechanically from completed candles and confirmed swings; do not use centered pivots or future candles.
2. Treat a sweep as context, not a standalone entry signal.
3. Require directional context and a subsequent confirmation event; the MQL5 CodeBase example uses H1 EMA(50) alignment and a reclaim/confirmation close.
4. Make stop distance and spread cost explicit. Skip trades where the stop is too small relative to spread.
5. Calculate monetary loss at the actual stop with OrderCalcProfit() rather than assuming tick-value metadata is correct for every broker/symbol/account.
6. Validate using real ticks, out-of-sample periods and walk-forward windows.

Not established:
- That SMC/ICT labels identify institutional orders or predict direction by themselves.
- That a particular sweep, CHoCH, FVG, session or EMA parameter has a positive expectancy on Exness XAUUSDm.
- That published PF, win rate or net-profit claims transfer to this broker, symbol suffix, account currency, spread, commission or execution environment.
- That the existing NOVA EA's embedded historical performance comments are independently reproducible. Several comments cite small samples (including 3–7 test trades) and one model comparison explicitly records negative test performance. These are not release-grade evidence.

## 3. Research candidate rules

The candidate adds an **opt-in** strict SMC research mode to the existing v1.83 Sniper MTF path; it does not replace the Core engine.

- Market context: H1 EMA(50), computed from 160 completed H1 bars; trade only when the latest completed H1 close and EMA slope agree with direction.
- Signal timeframe: existing analysis timeframe (configured as M15 in the target setup).
- Sweep: the completed bar at shift 2 takes a confirmed prior swing (pivot search shifts 5–20, with two older and two newer closed bars confirming the pivot); the next completed bar at shift 1 reclaims the level.
- Confirmation: the same completed shift-1 bar must have body greater than 0.6 ATR and close beyond the sweep candle's high/low (the current candidate's causal displacement + CHoCH checks).
- Session: London / New York GMT windows already represented in the EA's killzone helper (07:00–11:00 and 13:00–17:00 GMT). This is a research filter, not a claim that those hours are universally optimal.
- Existing pullback: retain the current M15 EMA20 pullback check as the entry timing condition; no unconfirmed FVG/OB interpretation is added.
- Stop: beyond the sweep wick by 0.10 ATR, and never closer than max(0.50 ATR, 3 × current spread).
- Target: fixed 2R from the structural stop.
- Risk: retain Sniper MTF risk input (0.12% default); disable AI score lot multipliers in this mode. If the calculated volume is below broker minimum, skip the trade instead of rounding risk upward.
- Spread / volatility / daily limits: existing EA guards remain in force. Do not optimize them on the final OOS window.
- Default: InpResearchSMC_Mode=false. The global compile-time execution hard-disable remains in place.

## 4. Engineering changes in the research branch

- Add the strict, opt-in research mode to the existing v1.83 candidate.
- Add H1 EMA(50) direction from completed H1 candles with one calculation per newly closed H1 bar.
- Require all three current closed-bar SMC conditions (sweep, displacement, CHoCH) and H1 direction agreement when research mode is selected.
- Use a structural stop and 2R target, enforce a minimum stop distance relative to ATR and spread, and remove score-based lot boosts in research mode.
- Change exposure accounting to include managed positions and pending orders across symbols. Missing SL or invalid P/L calculation fails closed.
- Extend order/position count checks to count managed positions and pending orders across symbols.

## 5. Remaining safety limitations

- The EA's in-flight reservation state is still process/instance-local. Two charts/instances can race before either sees the other's newly submitted order. An account-wide atomic reservation protocol (e.g. carefully keyed terminal Global Variables with lease/expiry/reconciliation) remains required before any execution enablement.
- Runtime interception proving zero broker requests has not been run. Compile-time guards and source tests are not runtime proof.
- Cross-symbol account aggregation must be tested with actual hedging/netting behavior and USC/USD conversions. OrderCalcProfit() is used per symbol, but broker-specific contract/tick behavior still needs verification.
- The candidate's legacy Recovery/Hedge/Averaging paths are not endorsed by this research and remain outside this new strategy. Do not enable them as a workaround.
- The current source change has not yet been compiled with MetaEditor. Prior 0-error/3-warning results apply to the earlier candidate revision only.

## 6. Acceptance plan

1. Source integrity and deterministic static tests on the exact commit.
2. MetaEditor X64 Regular compile on the exact source; zero errors, warnings triaged and recorded.
3. Runtime gate tests with request interception: every market/pending/modify/close/partial-close path emits zero broker requests while the hard-disable is compiled in.
4. Risk fixtures: multi-symbol positions, pending orders, missing SL, invalid symbol profit calculation, hedging and netting, cent/USD account modes, min-lot boundary, and simultaneous EA instances.
5. Strategy Tester with real ticks and realistic commission/spread/slippage. Log broker tick coverage and execution assumptions.
6. Chronological split: train/selection window only for limited parameter selection; lock all parameters before OOS. Require at least 30 closed OOS trades before interpreting PF/expectancy; if sample is insufficient, extend the window rather than relax the gate.
7. Walk-forward windows, Monte Carlo trade-order resampling, spread/slippage stress, and regime breakdown (trend/range/high-volatility).
8. Demo forward test with the exact broker symbol and account type. Live trading remains disabled.

Suggested research pass criteria (not achieved yet): OOS net expectancy > 0 after all costs, PF > 1.10, maximum equity DD within the user's risk budget, no single month or regime accounting for most profits, and stable positive walk-forward windows. These are gates for further evaluation, not promises of performance.