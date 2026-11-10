# VOOM_SYSTEM MT5 Read-only Bridge

This Windows process reads data from the MT5 terminal session already logged in to the intended **Exness Demo** account. Cloudflare Workers cannot run the Windows MT5 terminal itself.

## Safety boundary

- Read-only GET endpoints only: health, account summary, symbol discovery and quotes/candles.
- No order, trade, position-modification, transfer or withdrawal implementation exists.
- Requests to order/trade/execute/withdraw/transfer paths are denied, and non-GET/OPTIONS methods are rejected.
- Every protected endpoint requires both `Authorization: Bearer <tenant-specific token>` and `X-VOOM-TENANT-ID: <assigned tenant id>`.
- Missing tenant configuration returns 503; tenant mismatch returns 403; missing/invalid bearer token returns 401.
- Never reuse a terminal session or bridge token across customers. Never commit or paste tokens, account IDs, passwords, or credential-bearing environment files.
- Order execution must remain disabled even if the terminal itself reports trading allowed.

## Per-customer isolation

The Windows bridge uses two private environment variables:

- `MT5_TENANT_ID`: opaque route ID assigned by the trusted administrator for this one Demo terminal.
- `MT5_BRIDGE_TOKEN`: unique random bearer token for this tenant. It must be the same token referenced by this tenant's entry in the Cloudflare secret `MT5_TENANT_ROUTES`.

The Cloudflare proxy verifies the caller's Supabase Auth session, selects only that caller's `broker_connections` row under RLS, and routes by the row's unique `bridge_route_id` to the stable `voom-mt5-bridge-relay` Worker on `workers.dev`. The relay and proxy both validate the tenant ID and matching token. The legacy per-tenant URL is ignored. A pending customer request has no route and cannot reach the bridge.

## Windows setup

Install requirements inside an isolated Python 3.11 environment in this directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Keep the terminal session dedicated to the one tenant. This bridge reads the account already logged in through MT5; it does not accept a customer MT5 password.

Place private tenant configuration under:

```text
%LOCALAPPDATA%\VOOM_SYSTEM\secrets\mt5-tenant-id.txt
%LOCALAPPDATA%\VOOM_SYSTEM\secrets\mt5-bridge-<tenant-id>.token
```

The first file contains only the provisioned tenant ID. The second contains only the corresponding random token. Do not store either value in this repository. Provision matching route details into Cloudflare secret `MT5_TENANT_ROUTES` using a trusted secret-management path; do not send secret values through chat or ticket comments.

Start using the tenant-aware script from the bridge directory:

```powershell
.\run-bridge.ps1
```

The script fails closed if the tenant ID or tenant-specific token file is missing or invalid. It binds Uvicorn to `127.0.0.1:8787` and opens an outbound authenticated WSS connection to `https://voom-mt5-bridge-relay.suwapat787.workers.dev`. No custom domain, named Tunnel, or public local port is required. The relay client reconnects with backoff and does not log tokens or account payloads.

## Endpoints

- `GET /health`
- `GET /api/account` — retains existing numeric fields and adds `balance_decimal`, `equity_decimal`, `margin_decimal` and `free_margin_decimal` strings for exact decimal parsing.
- `GET /api/symbols?q=XAU&limit=100` — includes read-only contract size, tick size/value (profit and loss), profit/margin currencies, volume min/max/step, stops/freeze levels, calculation mode and a `risk_metadata_complete` indicator.
- `GET /api/quotes?symbol=<exact-terminal-symbol>&timeframe=M5&count=100`
- `GET /api/profit-calculation?symbol=<exact-terminal-symbol>&side=buy&volume=0.1&open_price=2000&stop_price=1990` — hypothetical stop-loss estimate via MT5 `order_calc_profit`; returns loss in account currency, never submits an order.

Supported timeframes: M1, M5, M15, M30, H1, H4, D1. Discover exact broker symbol names from `/api/symbols`; do not assume a particular gold symbol spelling.

## Validation before marking a customer connected

1. Confirm the chosen MT5 terminal is the intended Exness Demo account, not another broker/account.
2. Confirm a unique tenant ID and token were provisioned privately and the matching Cloudflare route-map entry exists.
3. Confirm requests without a bearer token return 401, an invalid token returns 401, a tenant mismatch returns 403 and absent tenant configuration returns 503.
4. Confirm the proxy checks the Supabase JWT and only returns the authenticated user's own connection row.
5. Confirm the outbound relay session is active and authenticated read-only health returns a current timestamp with `mode=read-only` and `order_submission_enabled=false`.
6. Confirm cross-customer connection IDs fail closed.
7. Confirm no order method exists and every layer keeps order execution disabled.

A passing CI build, a healthy relay Worker, an active local process, or an MT5 terminal connection alone does not prove that a specific customer connection has been provisioned. Do not mark a connection as connected until the entire authenticated path is tested.


## Instrument risk metadata contract

The `/api/symbols` response exposes the terminal's own `trade_contract_size` and matching `*_decimal` strings for exact decimal parsing, `trade_tick_size`, `trade_tick_value_profit`, `trade_tick_value_loss`, `currency_profit`, `currency_margin`, `volume_min`, `volume_max` and `volume_step` values. Missing, non-finite or non-positive required numeric values are returned as `null` and cause `risk_metadata_complete=false`; callers must not estimate or substitute contract/tick values. This is metadata only, not a position-sizing or execution endpoint. The bridge remains GET/OPTIONS-only and Exness Demo-only.

The legacy numeric JSON fields are preserved for compatibility. Risk consumers must use the `*_decimal` strings with decimal arithmetic; never pass JSON floating-point values directly into the risk normalizer.


## Read-only stop-loss calculation

`GET /api/profit-calculation` calls MT5 `order_calc_profit` with a strictly validated `buy` or `sell` side, symbol, lot volume, entry and adverse stop price. It validates the broker's volume min/max/step and returns the negative result as a decimal string in the authenticated account's deposit currency, plus the account currency and denomination key. An account reported as `USC` is classified as `standard-cent` and is accepted only with a symbol name ending in `c`. This uses the terminal's own calculation for the current market environment rather than assuming every symbol's tick value is denominated in the account currency. The endpoint is tenant-authenticated, Exness Demo-only, GET-only and does not call `order_send`.

The result is a pre-trade estimate, not a guaranteed fill price. The risk layer must add explicit commission, slippage and swap assumptions, normalize the native account amount into USD, and fail closed if any required value or FX rate is missing. MetaQuotes documents that `order_calc_profit` returns the estimated profit/loss in account currency: https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py.
