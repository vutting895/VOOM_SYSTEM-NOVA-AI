# NOVA EA v1.83 Brain Event Exporter

`NOVA_BrainEventExporter.mqh` is a local-only JSONL telemetry writer. It does not call WebRequest, OrderSend, CTrade, the MT5 bridge, or any remote API.

## Integration contract

Include this file from the reviewed EA candidate and call `NOVA_ExportMarketSnapshot(...)` from a bounded timer or an explicit telemetry event point. Do not call it on every tick without a sampling policy. Supply the exact source SHA-256 and repository commit for the compiled EA artifact. Only use closed-bar observations for downstream signal/decision events.

Output: `MQL5/Files/NOVA_BRAIN_EVENTS/events.jsonl` or the terminal Common Files equivalent when `use_common_files=true`.

The account HMAC field is a 64-zero placeholder. The host uploader replaces it using `NOVA_LOCAL_ACCOUNT_SCOPE` and `NOVA_ACCOUNT_SCOPE_HMAC_KEY` from the local environment before schema validation and transmission. The raw local account scope and HMAC key must never be added to the JSONL file, logs, source code, Git, or command line.

## Important limitations

- This module currently exports market_snapshot only; signal, decision, risk_check, execution_audit and trade_outcome serializers are not implemented.
- It has not yet been wired into the v1.83 candidate EA event loop or compiled with MetaEditor.
- UUID generation uses MT5 pseudorandom values for event uniqueness, not for cryptographic security.
- Validate timestamp behavior against the exact MT5 terminal/broker timezone before using event timestamps for research.
- This source is not evidence that the three runtime safety flags have been implemented. Keep ordersEnabled=false, executionEnabled=false, liveTradingEnabled=false as release requirements.
