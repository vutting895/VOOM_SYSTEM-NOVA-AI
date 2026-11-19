# NOVA Netlify Read-only API Gateway

## Delivery scope

This slice adds same-origin Netlify Functions for public Binance prices and authenticated Exness MT5 Demo reads. It does not enable broker writes.

| Route | Behavior |
|---|---|
| `GET /api/auth/config` | Public Supabase URL and publishable client key only |
| `GET /api/price?provider=binance&symbol=BTCUSDT` | Binance public ticker price; no API key required |
| `GET /api/price?provider=exness&symbol=XAUUSDm` | Authenticated Exness MT5 Demo quote through System Hub |
| `GET /api/market/overview` | Authenticated Exness Demo quotes for XAUUSDm, BTCUSDm and EURUSDm |
| `GET /api/market/candlesticks` | Authenticated, bounded Exness Demo candles |
| `GET /api/broker/status` | Current user's Exness Demo connection record |
| `GET /api/portfolio` | Account summary and open positions from the user's connected Demo terminal |
| `GET /api/history` | Closed deal history; maximum 90-day range and 500 rows |
| `POST /api/chat` | Authenticated proxy to the Cloudflare NOVA AI Worker |
| `POST /api/gen-ai/generate` | Authenticated research-only strategy generation proxy |
| `GET /api/marketplace` | Authenticated Worker catalog |
| `POST /api/backtest/run` | Authenticated research backtest proxy |
| `POST /api/trade` | Always returns HTTP 403; never forwards to a broker |
| Other unimplemented `/api/*` routes | Return JSON HTTP 501 instead of the SPA HTML fallback |

## Authentication and routing

- Private routes require a valid Supabase access token in the incoming `Authorization: Bearer` header.
- The `/login` route signs in with Supabase Auth. The public auth-config endpoint returns only the project URL and publishable key from the System Hub.
- The Supabase client persists the session and synchronizes its access token to `localStorage.nova_auth_token` for the existing Axios client; the Fetch API client also reads the active Supabase session directly.
- Netlify Functions forward the user token to the fixed NOVA System Hub URL or the fixed NOVA AI Worker URL. Both Workers validate the session; the Hub scopes connection lookups to the authenticated owner.
- `NOVA_SYSTEM_HUB_URL` defaults to `https://voom-system-hub.suwapat787.workers.dev`; only this HTTPS Worker host is accepted.
- Exness account data travels through System Hub → MT5 Read-only Proxy → tenant-specific Bridge Relay → local Windows MT5 Bridge.
- The tenant route and bridge token remain in the existing Cloudflare/Windows secret boundary. They are not copied into Netlify or the browser.

## Activation prerequisites

The source code alone does not provision an Exness account. A private read succeeds only when all of these are true:

1. The caller has a valid Supabase Auth access token.
2. The caller owns an Exness MT5 Demo connection row.
3. A trusted operator has provisioned that row's tenant bridge route.
4. The tenant's Windows MT5 Bridge is running against an Exness Demo terminal and has an authenticated Relay session.

A pending/unverified connection returns a non-success response; the API does not fabricate prices, balances, positions or history.

## MT5 Demo account identity binding

- Every tenant-dedicated Windows MT5 Bridge must be provisioned locally with `MT5_EXPECTED_ACCOUNT_LOGIN` and `MT5_EXPECTED_SERVER` before it can serve private reads.
- `MT5_EXPECTED_ACCOUNT_LOGIN` must be the exact numeric MT5 login; `MT5_EXPECTED_SERVER` must be the exact server string shown by the intended Demo terminal.
- The Bridge compares both values against `mt5.account_info()` on every protected read. Missing identity configuration returns HTTP 503; either mismatch returns HTTP 403.
- These values are provisioned out-of-band for the dedicated tenant Bridge. They must never come from browser input, request query parameters, Netlify variables, or user-editable connection labels.
- A tenant route must point to exactly one dedicated Bridge configured for that connection. Do not share one Windows terminal/Bridge across different account identities.
- Keep the values in the local protected Bridge environment, outside source control. After changing either value, restart the Bridge and verify the expected Demo account before allowing data reads.

## Environment

- `NOVA_SYSTEM_HUB_URL` is optional because the allowlisted default is compiled into the function.
- Binance public ticker prices need no API key. Binance private account access and order APIs are not implemented.
- Exness MT5 Bridge credentials remain tenant-scoped in the existing Windows/Cloudflare boundary; do not add them to Netlify.
- No service-role key, broker password, API secret or private signing key belongs in the Frontend or Netlify build environment.

## Safety and test boundary

- `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false` remain enforced.
- `POST /api/trade` is a deliberate 403 safety endpoint, not a simulated fill.
- Public Binance ticker reads are market-data-only and do not access a trading account.
- Netlify function contract tests run with `npm run test:netlify`.
- The MT5 portfolio/history additions are GET-only and retain tenant authorization at every hop.
- A successful CI test is not evidence that the production Netlify deployment, Supabase session, Exness account, or Windows Bridge is connected. Those require runtime smoke-test evidence.
