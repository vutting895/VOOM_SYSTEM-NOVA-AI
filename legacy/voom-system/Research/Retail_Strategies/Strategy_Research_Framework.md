# Retail Strategy Research Framework
## 1. Purpose
Retail techniques are useful sources of hypotheses, not guarantees. This folder deliberately avoids endorsing unverified claims of “smart money” or guaranteed win rates. Every idea must be defined in a way that can be tested without hindsight.

## 2. Candidate strategy families
- Trend-following: moving-average alignment, breakout, pullback.
- Mean reversion: deviation from a defined reference with a regime filter.
- Price action: swing structure, BOS/CHOCH, candle confirmation.
- Liquidity concepts: previous high/low sweep followed by close back inside a defined range.
- Supply/demand and order blocks: formalize zone creation, invalidation, age, and touch rules.
- Fair Value Gap (FVG): define the three-candle pattern, minimum size relative to ATR, expiry, and entry condition.
- Elliott Wave: record objective pivot rules and Fibonacci constraints; compare with a baseline because wave labeling can be subjective.
- Volatility-based exits: ATR or realized-volatility stops, but size positions to stop distance.
- Multi-timeframe confirmation: define which timeframe controls regime, setup, and trigger; avoid using future higher-timeframe candles.

## 3. Minimum mechanical definition
For each strategy, document:
- Market/universe, timeframe, trading hours and excluded news windows.
- Exact signal inputs and when they become available.
- Entry type, cancellation rule, stop, target, time stop, and re-entry rule.
- Risk sizing and portfolio constraints.
- Fees, spread and slippage assumptions.
- Expected failure modes and regime assumptions.
- Version ID and change log.

## 4. Evidence grading
- A: independent, reproducible evidence with realistic costs and out-of-sample tests.
- B: credible explanation but incomplete independent validation.
- C: practitioner anecdote, chart example, social media or marketing.
Do not promote C to A merely because the chart looks convincing. Keep screenshots and examples separate from statistical results.

## 5. Test protocol
1. Write rules before seeing the holdout results.
2. Test a simple baseline.
3. Use chronological train/validation/holdout splits.
4. Calculate net expectancy, drawdown, profit factor, average R, trade count and cost sensitivity.
5. Repeat across instruments and periods without assuming transferability.
6. Test parameter neighborhoods; brittle single-value optima are a warning.
7. Run walk-forward validation and demo forward test.
8. Record failed tests as well as successful ones.

## 6. Suggested VOOM experiment matrix
Compare one variable at a time: (a) entry rule, (b) regime filter, (c) ATR stop, (d) time/session filter, (e) confidence threshold, (f) execution filter. Keep risk controls constant. AI scoring should be evaluated against the same base strategy without AI, using untouched out-of-sample data.
