# NOVA Broker Adapter Contracts

This directory is a dependency-free contract layer for future isolated broker runtimes. It is **not** a deployed service, credential vault, broker connector, or execution engine.

## Relationship to the current architecture

- `integrations/system-hub` remains the authenticated control plane and source of truth for ownership, provider allowlists, connection lifecycle, and capabilities.
- Exness MT5 continues through the existing customer-specific Bridge → Relay → read-only Proxy. Do not load the MetaTrader5 Python package into Cloudflare Workers or a shared Hub process.
- IBKR requires a managed isolated IB Gateway/TWS runtime or an authenticated customer-side connector. A cloud service must never assume customer `127.0.0.1` or accept model/customer-selected host and port values.
- CCXT providers must be selected from a compiled allowlist, use provider-side read-only API keys, expose only explicitly granted read-only methods, and close clients deterministically.
- Credential access remains blocked until the dedicated server-side Vault path and owner A/B isolation gates are approved. This contract deliberately carries no plaintext credentials or secret references.

## Contract rules

1. The authenticated System Hub resolves the owner and connection before an adapter is invoked.
2. Adapter inputs contain only normalized connection metadata; they do not contain caller-controlled URLs, hosts, ports, or credentials.
3. Account data and provider account identifiers are normalized, timestamped, and validated as masked before they leave the adapter boundary. Signed balance values are preserved because some providers report liabilities or negative available margin; non-finite values are rejected.
4. Unknown providers, unsupported capabilities, stale/revoked connections, and unavailable runtimes fail closed.
5. The optional `market_data.read` capability has a corresponding typed `market_data_snapshot` protocol method. Adapters must fail closed when that capability is not granted.
6. `ordersEnabled`, `executionEnabled`, and `liveTradingEnabled` remain false. No order, position mutation, transfer, or withdrawal method belongs in this package.

## Verification

Run the dependency-free contract tests with:

```bash
python -m unittest discover -s integrations/broker-adapters/tests -v
```

Provider implementations and live/staging calls are intentionally separate milestones. Passing these tests does not prove broker connectivity or credential-vault readiness.
