# Institutional Trading Playbook
**Scope:** transferable institutional principles, not claims that a public source reveals a fund's proprietary strategy.

## 1. What institutional trading actually optimizes
Professional trading is not just entry signals. It balances expected alpha, urgency, market impact, liquidity, volatility, information leakage, and execution risk. The CFA Institute's trading/execution curriculum describes scheduled, liquidity-seeking, arrival-price, and smart-routing approaches, plus transaction-cost analysis (TCA). Forex is largely OTC, so venue and broker conditions matter.

## 2. Concepts to study and test
- **Execution benchmarks:** decision/arrival price, VWAP, TWAP, close, and implementation shortfall. Pick a benchmark that matches the strategy objective; do not assume VWAP is always best.
- **Liquidity and spread:** record spread, quote age, session, volatility, and slippage at signal and fill. Avoid trading when execution conditions exceed the strategy's tested envelope.
- **Order types:** market orders prioritize execution certainty but may pay spread/slippage; limit orders constrain price but may not fill. Stops can fill beyond their trigger during gaps or fast markets.
- **Market impact:** larger or urgent orders can move price; use this insight as a warning about liquidity and costs, not as proof of a specific fund's intent.
- **Regime awareness:** trend, range, high volatility, low liquidity, and news conditions can change strategy performance. Define regime labels before testing.
- **Post-trade review:** compare requested versus filled price, spread, slippage, rejection, latency, and missed fills. Report results by symbol, session, and volatility regime.

## 3. How to apply to VOOM
For each order, log: signal timestamp, bid/ask, spread, intended entry/SL/TP, order type, broker response, fill price, slippage, commission, latency, exit reason, and realized R. Add a pre-trade gate for spread, stale quotes, invalid stops, volume constraints, trading session and exposure.

Suggested execution quality metrics:
- Slippage (signed and absolute, points and account currency)
- Implementation shortfall versus decision/arrival price
- Fill/rejection rate and order latency
- Average spread at signal and fill
- Missed-trade rate for limit orders
- Net expectancy after transaction costs

## 4. Important distinction
“Banks/funds use X” is too broad unless a source documents the specific method. Public institutional material often explains execution principles and risk governance, not proprietary alpha signals. Elliott Wave, order blocks, FVG, liquidity sweeps, and SMC are candidate price-action hypotheses—not evidence of institutional order flow by themselves.

## 5. Research questions
1. Does the setup retain positive expectancy after spread, commission, swap, and slippage?
2. Does performance survive different months, volatility regimes, and broker data?
3. Does entry urgency improve net outcomes or simply increase costs?
4. Do filters improve out-of-sample performance enough to justify fewer trades?
5. Are apparent liquidity sweeps defined mechanically, without hindsight?
