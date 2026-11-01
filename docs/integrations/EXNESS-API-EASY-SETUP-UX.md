# NOVA — Easy Exness Trader API setup

**Audience:** account owners who do not need to understand APIs or development.
**Provider:** Exness Trader API for eligible Exness Platform accounts.
**Mode:** read-only only.

## User experience

The entry point is `/settings/broker/exness`, linked from both Broker Login and the legacy broker settings page.

The page explains the setup in three plain-language steps:

1. Confirm that the trading account is an eligible Exness Platform account. Standard MT4/MT5 accounts are not interchangeable with Exness Platform Trader API accounts.
2. Prepare a Trader API key with read-only permissions, the account ID, and the matching private signing key.
3. Complete a secure in-app setup flow once the server-side credential custody gate is approved.

The user does not need to configure a Gateway hostname, copy JSON, edit environment variables, install MT5, run a Windows bridge, or rent a VPS for the Trader API path.

## Credential safety / current limitation

The page intentionally does not contain API key or private-key fields yet. The current secret-custody implementation is not approved for customer credentials. Do not collect or transmit secrets until a dedicated owner-scoped server-side credential provider passes least-privilege, two-owner isolation, rotation/revocation, audit-redaction, and security-review gates.

The page must say **setup pending**, never **connected**, until an authenticated owner-bound provider read succeeds. Do not use health checks, UI state, synthetic tests, or a pending connection row as proof of a live account connection.

## What NOVA can read after the custody gate

The existing main-branch `exness-readonly-adapter.js` already contains server-side GET-only methods for:
- account details;
- account limits;
- account instruments;
- bounded historical candles, constrained by the account's own instrument list and API limits.

Live Bid/Ask ticks over WebSocket are not implemented in the current Hub lifecycle and must remain a separate later feature. Do not label candle history as a live quote stream.

## Safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `order_submission_enabled=false`
- `liveTradingEnabled=false`

No order placement, order/position mutation, withdrawal, transfer, or deposit route may be exposed.
