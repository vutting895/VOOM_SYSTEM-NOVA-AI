# Broker connectivity setup (NOVA)

The server-side endpoint `GET /api/broker/status?broker=binance|bybit|okx|coinbase|kraken|bitget` checks public market availability or reports that private account authentication is not yet enabled. Every response keeps `tradingEnabled: false`; no order endpoint exists.

## Binance
Set server environment variables `BINANCE_API_KEY` and `BINANCE_API_SECRET` only when an authenticated, per-user credential flow is implemented. Use a read-only key; disable trading and withdrawals; enable IP restrictions.

## Bybit
Set `BYBIT_API_KEY` and `BYBIT_API_SECRET` only when an authenticated, per-user credential flow is implemented. Disable trade/withdrawal permissions and restrict source IPs.

## Other providers
OKX, Coinbase Advanced, Kraken, and Bitget are currently public-market availability checks only. A successful public endpoint check does not connect or verify a customer's account.

## Web-first execution direction
The intended direction is for the web UI and AI to prepare and validate commands through authenticated server-side broker APIs. No Trading Webhook, MT5 EA, or MT5 bridge is included in the current architecture. Live order placement is not implemented and must remain disabled until user authentication, authorization, idempotency, risk approvals, audit logging, a kill switch, paper verification, and explicit release approval are tested.

## Local PowerShell example
Set secrets in the server process environment; do not paste them into chat or commit them:
```powershell
$env:BINANCE_API_KEY = '...'
$env:BINANCE_API_SECRET = '...'
npm run dev
```

## Production gate (important)
This repository currently has no complete user-authentication/session layer for broker account APIs. Do not expose the app publicly with exchange credentials configured until the endpoint is protected by authenticated sessions/authorization, tenant isolation, rate limiting, audit logging, secret rotation and HTTPS. The current API only checks public market availability or blocks private account checks; it never places orders. It is not a production trading system. Keep keys read-only until a separate security review and end-to-end paper-trading test pass.
