# Risk Controls Playbook
## 1. Design principle
Risk limits are hard constraints, not AI suggestions. The FCA's 2025 review of algorithmic trading controls emphasizes robust pre/post-trade controls, documented deployment procedures, testing, and oversight. CFA Institute material covers position limits, stop-loss limits, scenario analysis, VaR and risk budgeting.

## 2. Position sizing
For a planned trade:
1. Set risk budget in account currency = equity × risk fraction.
2. Estimate loss at stop using the broker's contract/tick-value model, including likely fees and a slippage allowance.
3. Size down to the broker's volume step; never round upward beyond the risk budget.
4. Validate minimum/maximum lot, tick size, tick value, margin, stop distance, and symbol-specific rules.
5. If any value is missing, stale, zero, or inconsistent, reject the trade rather than guessing.

A useful approximation is risk budget / estimated loss per lot, but the implementation must use broker-specific contract calculations; point values differ across symbols and account currencies.

## 3. Independent safeguards
- Maximum risk per trade and maximum aggregate open risk.
- Maximum positions and per-symbol/correlated exposure.
- Daily and weekly loss lock using a clearly defined equity/balance basis.
- Maximum consecutive losses and cooldown.
- Maximum spread, maximum slippage, quote-age threshold, and order timeout.
- Duplicate-order/idempotency guard.
- Margin-level and free-margin checks.
- Circuit breaker for repeated rejects, repeated executions, malformed signals, missing data, or service failure.
- Emergency stop that prevents new entries; position-closing policy must be explicitly defined and tested.
- Recovery after restart must reconcile actual broker positions and history before resuming.

## 4. Drawdown and portfolio risk
Track balance and equity drawdown separately. Use stress scenarios for gaps, spread widening, correlated positions, server outage, and slippage spikes. A daily stop does not guarantee a maximum realized loss in a fast market. Risk limits should be calibrated to account capital, strategy behavior, leverage, instrument and broker conditions.

## 5. Backtest controls
- Include realistic spread, commission, swap, slippage, and execution assumptions.
- Avoid look-ahead bias, survivorship bias, and data leakage.
- Separate development, validation and final holdout periods.
- Use walk-forward tests and parameter sensitivity surfaces rather than selecting one peak result.
- Include Monte Carlo/trade-order perturbation or bootstrap analysis where appropriate.
- Compare with simple baseline and no-trade benchmark.
- Report expectancy, profit factor, max drawdown, recovery, average R, trade count, exposure, worst day/week, and cost share.
- A profitable backtest is not proof of live profitability; forward-test in demo before any live use.

## 6. VOOM safety policy
Default to paper/demo. AI can lower confidence or veto an order but cannot override hard risk limits. Fail closed when risk service, price feed, or validation is unavailable. Store secrets outside source control and redact them from logs. Every risk decision should record rule, input values, and result.
