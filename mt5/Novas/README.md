# Nova's MT5 Expert Advisor

Planned read-only EA bridge for Exness Demo.

## Hard safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No OrderSend, trade modification, close-position, transfer or withdrawal capability.
- EA may publish heartbeat, account snapshot and closed-bar market history only.

The EA source is not generated in this foundation step. Implement only after the bridge contract and source mapping are reviewed.
