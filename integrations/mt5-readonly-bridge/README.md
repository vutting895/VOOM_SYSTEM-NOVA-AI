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
- `GET /api/account`
- `GET /api/exposure` — broker-sourced open positions and active pending orders, durable Broker-Day Starting Equity, market tick freshness, and broker-recalculated candidate risk when a validated `candidate` query is supplied
- `GET /api/symbols?q=XAU&limit=100`
- `GET /api/quotes?symbol=<exact-terminal-symbol>&timeframe=M5&count=100`

Supported timeframes: M1, M5, M15, M30, H1, H4, D1. Discover exact broker symbol names from `/api/symbols`; do not assume a particular gold symbol spelling.

## Exposure, durable Broker-Day baseline and candidate risk

`GET /api/exposure` calls MT5 `positions_get()` and `orders_get()` under the process lock and calculates each position/pending-order loss to its broker-reported stop loss using `order_calc_profit()` in the account currency. Pending orders are included in total exposure and order count.

### Durable Broker-Day Starting Equity

- The Bridge polls the active MT5 account and the broker's current D1 bar every 2 seconds while the Windows process is running.
- The D1 bar open timestamp is used as the broker-day key; the baseline is isolated by Tenant ID + Account Login + Broker Server + D1 open timestamp.
- On the first observation within 30 seconds of that broker D1 open, the Bridge stores the observed equity in SQLite with WAL and FULL synchronous durability. The database defaults to `%LOCALAPPDATA%\\VOOM_SYSTEM\\state\\mt5-risk-state.sqlite3`; `MT5_RISK_STATE_DB` can override the path.
- The saved value is read back after a process restart and is never overwritten during the same broker day.
- If the Bridge was offline or first observed the D1 day more than 30 seconds after rollover, it does **not** substitute current equity. `broker_day_baseline_available=false` and Decision API fails closed until a valid baseline is captured on a later broker day.
- This is a first-observed equity sample within a 30-second rollover window, not a mathematically exact tick at the D1 boundary. The capture delay is included in the response for audit.

### Candidate Risk

Decision API forwards the EA's candidate as a bounded query object:
```json
{
  "symbol": "XAUUSDm",
  "side": "BUY",
  "volume": 0.10,
  "entry_price": 2600.20,
  "stop_loss": 2590.20
}
```

The Windows Bridge validates the exact field set, broker symbol, volume minimum/maximum/step, side and stop-loss geometry, then recalculates candidate loss using MT5 `order_calc_profit()`. The returned `proposed_entry_risk_money` and `candidate_risk.risk_money` are in the broker account currency (including USC if that is the account's currency); no USD/THB conversion is applied to risk math.

This is a risk calculation for the supplied candidate, **not volume sizing**. The EA/strategy must supply a valid candidate volume. The Bridge does not invent Entry, Stop Loss, side or volume. Per-trade risk-budget-based volume sizing requires a separately approved per-trade risk budget and remains unimplemented. Commission, slippage and gap loss are not included; the calculation explicitly reports those exclusions.

If any open exposure has no valid stop loss, unsupported side, invalid volume/price, failed broker calculation or invalid equity, aggregate exposure is `null` with `risk_calculation_complete=false`. If candidate details are absent or invalid, candidate risk is `null` with `candidate_risk_complete=false`. Consumers must never treat unknown risk as zero.

`market_data_at` is sourced from the MT5 tick timestamp for the candidate symbol. `market_open=true` only when that tick is no more than 60 seconds old and is not materially in the future; stale/no tick is fail-closed.

The endpoint continues to report `policy_attestation.status=not_attested`. The Bridge cannot certify the EA's active inputs, source/EX5 equivalence, or installed policy version. Do not mark a connection production-ready from a successful snapshot alone.

## Validation before marking a customer connected

1. Confirm the chosen MT5 terminal is the intended Exness Demo account, not another broker/account.
2. Confirm a unique tenant ID and token were provisioned privately and the matching Cloudflare route-map entry exists.
3. Confirm requests without a bearer token return 401, an invalid token returns 401, a tenant mismatch returns 403 and absent tenant configuration returns 503.
4. Confirm the proxy checks the Supabase JWT and only returns the authenticated user's own connection row.
5. Confirm the outbound relay session is active and authenticated read-only health returns a current timestamp with `mode=read-only` and `order_submission_enabled=false`.
6. Confirm cross-customer connection IDs fail closed.
7. Confirm no order method exists and every layer keeps order execution disabled.

A passing CI build, a healthy relay Worker, an active local process, or an MT5 terminal connection alone does not prove that a specific customer connection has been provisioned. Do not mark a connection as connected until the entire authenticated path is tested.
