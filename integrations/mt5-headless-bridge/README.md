# VOOM_SYSTEM Headless MT5 Read-only Bridge (Linux/Docker)

This is a **candidate replacement runtime** for the existing Windows Bridge. It preserves the current relay-facing HTTP contract and tenant headers, so NOVA's Cloudflare Relay/Proxy does not need a new broker API contract.

## What “headless” means here

The MT5 terminal runs inside a Linux container under Wine/Xvfb without publishing a desktop, VNC/noVNC port, or local bridge API port. Python calls the terminal through the private mt5linux RPyC interface. A desktop session does not need to remain open on the Windows PC.

This does **not** turn MT5 into a native Exness REST API. It still runs the MetaTrader 5 terminal process inside the container and therefore needs a supported runtime, broker connectivity, and valid Demo credentials. The upstream lprett/mt5linux image is third-party software; pin and review an image digest before production use.

## Safety properties

- Exness **Demo only**; keep Read-only + AI Analysis enabled.
- Only GET /health, /api/account, /api/symbols, and /api/quotes are forwarded by the relay client.
- Bridge routes require a tenant-specific bearer token plus X-VOOM-TENANT-ID.
- POST/PUT/PATCH/DELETE and order-like routes fail closed. No order-send implementation is included.
- The RPyC engine port is available only on the private Docker network. This Compose file publishes no host ports, including 18812, 8787, VNC, or noVNC.
- The relay client initiates outbound TLS WebSocket to the existing fixed Cloudflare workers.dev relay. It does not accept arbitrary upstream URLs.
- Secrets are mounted as Docker secret files. Secret files are ignored by Git and must never be committed, printed, or pasted into chat/issues.
- A health response or running container does not prove that the broker account or user's Proxy is authenticated. Only end-to-end account and quote reads do.

## Prerequisites

- Docker Engine with Compose v2 on an always-on Linux host/VPS.
- Permission and capacity to run the reviewed upstream Wine/MT5 container.
- An Exness **Demo** account and the exact server name displayed by Exness/MT5.
- A dedicated tenant ID and long random bridge token provisioned with the existing Cloudflare route-map procedure. Do not generate or reveal production route tokens in a ticket.

## Provision local secret files

Create the following files manually in this directory's secrets/ folder. These paths are ignored by Git. Restrict access to the files and the host running Docker.

| File | Content |
|---|---|
| secrets/mt5-login.txt | Exness Demo login number only |
| secrets/mt5-password.txt | Exness Demo trading password only |
| secrets/mt5-server.txt | Exact Exness Demo server label |
| secrets/vnc-password.txt | Strong random local VNC password (VNC ports are not published) |
| secrets/mt5-tenant-id.txt | Provisioned opaque tenant ID |
| secrets/mt5-bridge-token.txt | Matching long random token for this tenant |

Never use live-account credentials. These contents are not needed in a .env file and must not be committed.

## Validate and start

From this directory, after all six secret files exist:

    docker compose config --quiet
    docker compose build mt5-headless-bridge
    docker compose up -d
    docker compose ps
    docker compose logs --tail=50 mt5-headless-bridge

The bridge process binds FastAPI only to container loopback (127.0.0.1:8787) and opens the outbound relay session. Do not add ports entries. Avoid logging upstream MT5 console output because it may contain account-related diagnostics.

To stop the candidate runtime:

    docker compose down

The mt5_engine_state volume persists the terminal's own runtime state. Protect the host and Docker volume as credential-bearing data. Remove it only as a separate, explicitly reviewed cleanup operation after required state and logs are preserved.

## Controlled migration plan

1. Review and merge the code through the NOVA pull-request process. The existing Windows bridge remains unchanged during review.
2. Run contract tests and validate that Compose publishes no ports.
3. First provision a **separate staging tenant/route** for relay testing. The relay Durable Object keeps one session per tenant and a new session can replace the current one; do not attach the current production tenant until the controlled cutover window.
4. Through the external Cloudflare relay, verify authenticated /health, /api/account, exact symbol discovery, and a quote/candle payload. Keep account identifiers and financial values out of logs.
5. Verify the signed-in Supabase user's System Hub/Proxy path and prove a different user's connection ID is rejected.
6. At an approved cutover, stop the Windows relay client before reusing the same tenant route, start the headless client, and repeat the end-to-end checks. If any check fails, stop the candidate and restore the prior Windows runtime.
7. Update the Supabase connection state only after both external relay data reads and user-Proxy ownership checks pass. CI, Worker health, a connected WebSocket, or local quotes alone are not sufficient evidence.
8. Retain the old Bridge source and rollback instructions until post-cutover tests pass; do not delete files or credentials as part of this change.

## Supported API contract

- GET /health — authenticated terminal/connection readiness, read-only flags
- GET /api/account — account summary
- GET /api/symbols?q=XAU&limit=100 — symbol discovery
- GET /api/quotes?symbol=XAUUSDm&timeframe=M5&count=100 — quote and OHLC bars

Discover the exact symbol name from the running terminal; do not assume a broker symbol suffix. Supported timeframes: M1, M5, M15, M30, H1, H4, D1.

## Current status

This folder is an implementation candidate until code review, CI, external relay reads, and authenticated Supabase Proxy ownership tests pass. It is not a claim that this headless runtime has been deployed or connected to an Exness account.
