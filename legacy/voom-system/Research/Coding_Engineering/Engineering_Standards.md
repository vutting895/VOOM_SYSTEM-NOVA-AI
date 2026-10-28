# VOOM Engineering Standards
## 1. Architecture boundaries
- **MT5 EA (MQL5):** market data capture, local pre-trade validation, order submission, position reconciliation, and safety fallback.
- **Python service:** research, feature calculation, backtest orchestration, model inference, structured logs and health checks.
- **Cloudflare Worker:** authenticated API gateway/validation and lightweight inference/routing only; no secret exposed to browser or EA logs.
- **Web dashboard:** configuration and visibility; should not be the only layer enforcing risk.
- **Storage:** versioned strategy configuration, signal/order journal, backtest results and audit events.

## 2. API contract
Use versioned JSON schemas and explicit fields such as request_id, schema_version, timestamp_utc, symbol, timeframe, bid, ask, spread_points, signal, confidence, stop_loss, take_profit, risk_fraction, expiry, and reason_codes. Validate type, range, timestamp freshness, symbol allowlist and request authentication. Reject unknown or malformed requests. Make order requests idempotent to prevent duplicates.

## 3. Reliability and security
- Store credentials in environment variables or platform secret storage; never commit real secrets to Git.
- Use HTTPS, authenticate service-to-service calls, rotate leaked keys, redact secrets from logs.
- Apply timeouts, bounded retries, backoff, rate limits and circuit breakers.
- Fail closed for new entries when AI or required market data is unavailable.
- Never let a model response directly execute an order without deterministic schema/risk validation.
- Use structured logs, request IDs, health endpoints and explicit error codes.
- Keep configuration separate from code; validate on startup.
- Pin dependency versions and review release notes/security advisories.
- Use Git branches, small commits, tests and a documented rollback path.

## 4. Testing layers
- Unit tests for indicators, sizing, risk limits, time conversions and signal validation.
- Integration tests for EA↔service JSON contract, authentication, timeouts and broker rejects.
- Backtests with realistic costs and no look-ahead.
- Contract tests for Worker API.
- Demo forward tests, reconnect/restart tests, stale feed tests, duplicate-message tests and kill-switch tests.
- Compile MQL5 with MetaEditor and inspect warnings; a successful file write is not a successful compile.
- Run static checks, dependency audit and secret scanning before deployment.

## 5. Modern coding learning path
- MQL5 official reference for order APIs, event model, indicators, files, network functions and Python integration.
- Python official tutorial and typing/testing documentation for maintainable services.
- TypeScript/React/Next.js documentation for web apps; use accessible semantic components and server-side secret handling.
- Prefer small typed modules over one giant file when the project allows; preserve single-file packaging only when deployment constraints require it.
- Pin versions and test upgrades instead of blindly adopting “latest”.

## 6. Release checklist
[ ] compile cleanly  
[ ] unit/integration/contract tests pass  
[ ] backtest reproducible and cost-aware  
[ ] no secrets in repository or logs  
[ ] EA/service schema matches  
[ ] duplicate and stale signal protections tested  
[ ] demo forward test completed  
[ ] rollback and operator stop procedure documented  
[ ] live trading remains disabled until explicitly approved
