# NOVA MT5 Demo Execution Adapter — disabled scaffold

Status: **preflight-only; broker dispatch is not implemented or authorized**.

This package is isolated from the existing read-only MT5 Bridge/Proxy/Relay. It contains no MetaTrader5 import, broker network listener, order-send call, or mutation route.

## Current behavior

- Validates an HMAC-signed command envelope bound to tenant, connection, pinned account login/server, expiry, command ID and nonce.
- Uses a local SQLite replay guard for one-time nonce consumption.
- Verifies MT5 account trade mode is Demo, Exness identity, pinned account/server and terminal connectivity.
- Parses volume and protection prices with Decimal-safe values; binary floats are rejected.
- Returns a preflight result only. Risk is explicitly reported as `not_evaluated`.
- `dispatch_demo_order` always raises `ExecutionDisabled`.

The adapter does not claim risk approval, broker connectivity, or order execution. No secret is stored in source; HMAC material must be provisioned out-of-band in a future, separately approved integration.

## Local tests

```sh
python -m py_compile adapter.py command_contract.py test_adapter.py
python -m unittest -v
```

All three trading flags are hard-coded false in this scaffold:
`ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
