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
- `GET /api/exposure` — broker-sourced open positions and active pending orders, counts, account-currency stop-loss risk, current-equity risk percentage, and UTC snapshot time
- `GET /api/symbols?q=XAU&limit=100`
- `GET /api/quotes?symbol=<exact-terminal-symbol>&timeframe=M5&count=100`

Supported timeframes: M1, M5, M15, M30, H1, H4, D1. Discover exact broker symbol names from `/api/symbols`; do not assume a particular gold symbol spelling.

## Exposure and risk-policy attestation

`GET /api/exposure` calls MT5 `positions_get()` and `orders_get()` under the same process lock and calculates each position/pending-order loss to its broker-reported stop loss using `order_calc_profit()` in the account currency. Pending orders are included in the total exposure and order count.

If any exposure has no valid stop loss, an unsupported side, invalid volume/price, failed broker calculation, or invalid equity, the aggregate risk values are returned as `null` with `risk_calculation_complete=false`. Consumers must reject the snapshot for risk authorization; they must never treat unknown risk as zero. `snapshot_at` is UTC and applies to the complete read operation.

The endpoint deliberately reports `policy_attestation.status=not_attested`. The Bridge cannot infer the active EA inputs, verify the installed EX5 binary against source, or certify a NOVA policy version. Do not set a policy version in the Bridge until a signed/verified EA-side attestation and source/binary reconciliation exist. The Bridge does not calculate Broker-Day Starting Equity; the NOVA Risk Gate must continue to fail closed when that required field is absent.

## Validation before marking a customer connected

1. Confirm the chosen MT5 terminal is the intended Exness Demo account, not another broker/account.
2. Confirm a unique tenant ID and token were provisioned privately and the matching Cloudflare route-map entry exists.
3. Confirm requests without a bearer token return 401, an invalid token returns 401, a tenant mismatch returns 403 and absent tenant configuration returns 503.
4. Confirm the proxy checks the Supabase JWT and only returns the authenticated user's own connection row.
5. Confirm the outbound relay session is active and authenticated read-only health returns a current timestamp with `mode=read-only` and `order_submission_enabled=false`.
6. Confirm cross-customer connection IDs fail closed.
7. Confirm no order method exists and every layer keeps order execution disabled.

A passing CI build, a healthy relay Worker, an active local process, or an MT5 terminal connection alone does not prove that a specific customer connection has been provisioned. Do not mark a connection as connected until the entire authenticated path is tested.
