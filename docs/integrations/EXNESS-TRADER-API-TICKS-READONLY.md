# Exness Trader API — read-only ticks stream

**Status:** implementation draft on a stacked PR branch. Not deployed, not registered in System Hub, and not connected to customer credentials.

## Data path

1. Resolve the account Access Point with a signed REST GET through the Gateway.
2. Read the account instrument list and reject any requested symbol not present in that account.
3. Sign the exact WebSocket handshake path as GET:
   `/v1/server-events/accounts/{account_id}/ws/ticks`.
4. Establish the outbound WebSocket handshake through the Cloudflare Workers-compatible fetch upgrade path.
5. Send only the documented subscription message:
   `{ id, subscribe: { event: "ticks", instruments } }`.
6. Return the internal socket to the System Hub lifecycle owner. The socket and signed headers must never be returned to a browser or logged.

## Scope

- Read-only Bid/Ask tick stream only.
- 1–50 unique, account-available instruments per subscription.
- Subscription ID restricted to 1–64 safe ASCII characters.
- Account ID and Access Point remain bound to the owner/connection-scoped credential resolver.
- Existing REST account, limits, instrument, and candle reads remain unchanged.
- Reconnect/backoff, durable fan-out, persistence, and UI delivery belong to a separately reviewed Hub lifecycle layer.

## Safety

- No HTTP method other than GET is used for the WebSocket handshake.
- The only WebSocket message sent is the `ticks` subscription payload.
- No transaction, account-state, order, position, withdrawal, transfer, or trade-mutation streams are subscribed.
- `ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, `liveTradingEnabled=false`.
- No customer API key, private key, account ID, or real Exness request is included in tests.
- Credentials remain unavailable until the dedicated owner-bound server-side secret custody gate is approved.
- Do not treat Key Management visibility as a completed connection test. Require a signed Gateway discovery + account identity + instrument read + ticks handshake in a controlled staging session.

## Validation

Synthetic tests cover the exact signed GET path, WebSocket Upgrade header, account instrument allowlist, subscription payload, and unchanged execution-off flags. They do not prove that a real Demo MT5 account is eligible or that a production Cloudflare runtime has connected successfully.
