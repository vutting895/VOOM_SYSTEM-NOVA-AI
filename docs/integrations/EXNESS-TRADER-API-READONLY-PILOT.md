# Exness Trader API — read-only pilot

**Status:** isolated adapter prototype; not deployed, not registered, and not connected to customer credentials.

## Account compatibility

This adapter targets the Exness Trader API for eligible Exness platform trading accounts. It is not an MT4/MT5 terminal adapter. Standard MetaTrader accounts must continue to use their separate supported integration path.

## Current implementation scope

- Ed25519 request signing for GET requests only.
- Gateway access-point discovery for a specified account ID.
- Account configuration snapshot read from the discovered access point.
- Strict Exness HTTPS host validation, bounded response size, identity matching, and sanitized errors.
- Capability flags explicitly disable market-data reads, order submission, trade mutation, withdrawal, transfer, and live trading.

## Not yet implemented

- Market quotes, ticks, candles, or WebSocket streaming.
- System Hub authenticated routes and owner-bound connection records.
- Customer API key/private key intake or retrieval.
- Secure customer secret custody. The existing secret-manager readiness gate remains blocking.
- Deployment or production activation.

## Required next gates

1. Add market-data GET methods against the current official Trader API contract, with bounded symbols/timeframes and response validation.
2. Implement the customer secret custody design only after the dedicated server-only role, authenticated owner binding, two-owner isolation, rotation/revocation, and secret-leak tests pass.
3. Wire the adapter into the existing System Hub using authenticated session identity; never accept a tenant/user ID as authority from the browser or model.
4. Run synthetic tests, then staging tests using an approved secure secret-entry path. Never put API secrets in chat, Git, frontend variables, or logs.
5. Keep all execution capabilities disabled and require exact-head CI plus security review before deployment.

## Safety invariants

`ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`. No order, position mutation, withdrawal, transfer, or deposit method is exposed.
