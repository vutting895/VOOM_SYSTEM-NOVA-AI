# Broker connectivity setup (NOVA)

The server-side endpoint `GET /api/broker/status?broker=binance|bybit|mt5` checks connectivity only. Every response keeps `tradingEnabled: false`; no order endpoint exists.

## Binance
Set server environment variables `BINANCE_API_KEY` and `BINANCE_API_SECRET`. The endpoint signs a request to `GET /api/v3/account`. Create a read-only key; disable trading and withdrawals; enable IP restrictions.

## Bybit
Set `BYBIT_API_KEY` and `BYBIT_API_SECRET`. The endpoint signs a request to `GET /v5/account/wallet-balance` for a Unified account. Disable trade/withdrawal permissions and restrict source IPs.

## MetaTrader 5
Set `MT5_BRIDGE_HEALTH_URL` and `MT5_BRIDGE_TOKEN`. The bridge must accept a Bearer token and return JSON `{"status":"ok"}` after token validation. Use HTTPS outside localhost. A broker/terminal-specific bridge is not included here and must be installed and reviewed separately.

## Local PowerShell example
Set secrets in the server process environment; do not paste them into chat or commit them:
```powershell
$env:BINANCE_API_KEY = '...'
$env:BINANCE_API_SECRET = '...'
npm run dev
```

## Production gate (important)
This repository currently has no user-authentication/session layer for the broker-status API. Do not expose the app publicly with exchange credentials configured until the endpoint is protected by authenticated sessions/authorization, rate limiting, audit logging, secret rotation and HTTPS. The current API only checks connectivity and never places orders; it is not a complete multi-user credential vault or a production trading system. Keep keys read-only until a separate security review and end-to-end paper-trading test pass.
