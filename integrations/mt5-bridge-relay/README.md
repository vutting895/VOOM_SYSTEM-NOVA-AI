# VOOM MT5 Bridge Relay — workers.dev only

This Worker removes the custom-domain and named-Tunnel dependency from the Windows MT5 read-only Bridge. The stable relay endpoint is:

https://voom-mt5-bridge-relay.suwapat787.workers.dev

The Windows process opens an outbound authenticated WSS connection to /connect. A Durable Object holds one session per opaque tenant ID and forwards only allowlisted GET requests to that tenant's loopback-only FastAPI service at 127.0.0.1:8787. The Windows origin never needs a public DNS record, custom domain, public port, or cloudflared process.

## Safety properties

- The relay and API proxy both validate the tenant ID and tenant-specific bearer token against MT5_TENANT_ROUTES.
- The proxy authenticates the Supabase session and selects only the signed-in user's own broker_connections row before choosing the tenant.
- The relay accepts only /health, /api/account, /api/symbols, and /api/quotes; unsupported methods and order-like routes are rejected.
- The Windows process connects outbound over WSS and calls only authenticated localhost GET endpoints.
- Missing route configuration, no active bridge session, timeout, invalid tenant, or invalid token fail closed.
- The relay does not enable order placement, position changes, transfers, withdrawals, or live trading.

## Deployment and secret provisioning

The relay code is deployed by the repository Cloudflare backend workflow after the reviewed change is merged and CI passes. Its Worker has a Durable Object binding named BRIDGE_SESSIONS. Public `/healthz` verifies Worker liveness only. Tenant `/health` requires bearer-token and tenant authentication, then checks the active tenant WebSocket and local MT5 Bridge; it must not report healthy from Worker liveness alone.

Before the customer connection can work, the relay Worker must have its own secret named MT5_TENANT_ROUTES. This is a JSON object keyed by tenant ID. Each entry requires tenantId and token; the token must match the private Windows token file and the existing proxy route entry. The proxy ignores the old per-tenant URL and routes to this stable relay Worker.

For the current single-tenant setup only, run tools/windows/provision-mt5-relay-route.ps1 with -ConfirmSingleTenantRoute after the relay Worker has been deployed. The script reads the private tenant files and pipes the route JSON directly to Wrangler without printing or writing it to disk. It replaces the entire relay tenant map; do not run it if more than one tenant must be retained. For multi-tenant operation, provision the complete tenant map through the approved secret-management path.

## Windows startup

Use tools/windows/run-bridge-from-git.ps1 from the same Windows user session as the intended Exness Demo MT5 terminal. The bootstrap refreshes the source from main, installs requirements, and runs run-bridge.ps1. That script launches the local Bridge and maintains the outbound relay connection with retry/backoff. It does not use a custom domain, named Cloudflare Tunnel, or expose port 8787 publicly.

## Verification required before connecting the database row

1. Confirm the relay Worker health returns status relay_ready and all order/live execution flags are false.
2. Confirm unauthenticated requests return 401 and invalid/mismatched tenant credentials fail closed.
3. Provision MT5_TENANT_ROUTES privately and start the Windows bridge relay client.
4. Confirm one authenticated Bridge session is live for the intended tenant and authenticated read-only health returns terminal_connected=true and account_session_available=true.
5. Confirm the signed-in user's request reaches only their own route and can read account/quote data.
6. Only then assign the matching bridge_route_id and change the broker_connections row from pending to connected.

Do not mark a connection connected from Worker health or a local process start alone.
