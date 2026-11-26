# NOVA EA v1.82 — safety baseline

## Identity

Canonical EA file: `integrations/mt5/NOVA_EA_v1.82.mq5`.

## Implemented in this patch

- EA identity and MetaTrader version updated to NOVA EA 1.82.
- Compile-time `NOVA_READ_ONLY_MODE=true`; `OnTick()` exits before any trading logic.
- Initialization rejects legacy presets that set `InpTradeEnabled=true`.
- Guarded defaults: 1% nominal risk, 1% single-trade cap, 9% aggregate open-risk setting, 10% daily-loss setting, minimum-lot override disabled.
- Account-wide exposure snapshot helper and a five-position-plus-pending-order ceiling constant. The helper is informational only in this read-only build.

## Not implemented / not proven

This source is a minimal EA scaffold with 30 registered module names, not a complete implementation of 30 strategies. No order execution adapter, atomic reservation, broker reconciliation, or MT5 Bridge transport is implemented by this patch. The account exposure snapshot is not atomic and must not be treated as permission to place an order.

Native MetaEditor compilation, Strategy Tester validation, and Exness Demo verification have not been run by this repository patch. Keep Live Trading and all execution OFF. Do not merge until those gates have evidence.

## Test

Run: `python -m unittest tests/test_nova_ea_v182_safety.py`.
