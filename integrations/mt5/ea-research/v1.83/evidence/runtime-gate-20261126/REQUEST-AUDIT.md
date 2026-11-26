# Request Audit contract

All order-mutating operations must pass through the two audited adapters:
- NovaAuditOrderSend(MqlTradeRequest&, MqlTradeResult&)
- NovaAuditPositionModify(ticket, sl, tp)

Structured terminal log prefix: NOVA_REQUEST_AUDIT.
Stages: BLOCKED, API_CALL, SUMMARY.
Counters: attempts, blocked, api_calls, accepted, rejected.

The candidate is compile-time disabled. Each identified call-path guard emits a BLOCKED event. The adapters contain a final hard-disable check immediately before the broker API call. Any future direct broker API call outside these adapters is a static-test failure.

Actual terminal logs are pending because the candidate has not been loaded into an isolated MT5 tester terminal.
