# VOOM Web Dashboard — UI/UX Design Brief
## 1. Goals
The dashboard should make the system's state, risk, and actions obvious. Visual polish must not obscure operational status. Trading controls should be deliberate and auditable.

## 2. Information architecture
1. **Overview:** connection status, MT5 terminal/broker state, worker/API health, feed age, current mode (Backtest/Demo/Live), active strategy version.
2. **Risk panel:** daily/weekly loss usage, equity drawdown, open risk, margin, position count, spread and circuit-breaker state.
3. **Signals:** timestamp, symbol, timeframe, direction, confidence, reason codes, expiry and rejection reason.
4. **Positions/orders:** actual broker positions, SL/TP, volume, current risk, fill/slippage and exit reason.
5. **Research/backtests:** version, date range, costs, trade count, net expectancy, profit factor, drawdown, equity curve and out-of-sample label.
6. **Configuration:** validated parameters with defaults, bounds, audit trail and reset-to-known-good.
7. **Logs/diagnostics:** correlation/request ID, component, timestamp, severity and safe redacted details.

## 3. Safety-critical interactions
- Clearly distinguish **Demo/Paper** from **Live** at all times.
- Keep live trading disabled by default; require explicit confirmation and display account/symbol/risk scope.
- Use a two-step confirmation for dangerous actions and prevent double-click duplicate submissions.
- Show stale/offline/degraded state in text, not color alone.
- Never display API secrets; use masked status and rotation guidance.
- Separate “stop new entries” from “close positions”; label their distinct effects.
- Make failed requests visible and preserve audit history.

## 4. Visual and responsive guidance
- Prioritize clear hierarchy, readable numeric values, consistent spacing and a restrained palette.
- Use tables for dense order data, charts for time-series, and filters for symbol/date/regime.
- Support keyboard navigation, visible focus, semantic labels, sufficient contrast and accessible error messages.
- Design mobile layouts for monitoring and safe read-only tasks; avoid placing irreversible controls where accidental taps are likely.
- Provide empty, loading, offline, stale-data, error and success states.
- Do not rely on animation for important updates; show last-update timestamps and data freshness.

## 5. Implementation checklist
[ ] reusable components and design tokens  
[ ] typed API models and schema validation  
[ ] responsive layouts and accessible controls  
[ ] loading/error/empty/offline states  
[ ] server-only secret handling  
[ ] role/permission checks for sensitive actions  
[ ] tests for forms, confirmation, stale state and duplicate clicks  
[ ] audit log for configuration and operator actions  
[ ] dashboard displays source timestamp and strategy version

## 6. Suggested dashboard sections
Overview | Signals | Positions | Risk Guard | Backtest Lab | Strategy Config | Logs | System Health
