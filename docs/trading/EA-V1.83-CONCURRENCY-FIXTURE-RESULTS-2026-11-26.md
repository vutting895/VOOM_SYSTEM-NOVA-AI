# NOVA EA v1.83 — Concurrency and Broker Risk Fixture Results

Date: 2026-11-26
Scope: research candidate source `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`.
Status: local deterministic test harness PASS; production reservation/runtime implementation remains NOT COMPLETE.

## Exact candidate identity

- Source SHA-256: `E23FB5D0CD51A5792976C5684852413962CD5BC0F4118771FEBB33D8F283F67D`.
- Compile-time gate: `NOVA_PHASE2_EXECUTION_DISABLED=true`.
- Candidate source was not modified during this test-harness addition.

## Test execution

Command on connected Windows research workspace:

```powershell
node --test tests/nova-ea-v183-source-integrity.test.mjs tests/nova-ea-v183-concurrency-runtime-fixtures.test.mjs
```

Result: **20 passed, 0 failed**, 227.9 ms.

### New 11-test fixture coverage

1. 64 concurrent chart-instance requests competing for the final account risk slot: exactly one reservation succeeds in the deterministic atomic-ledger reference model.
2. Missing SL / invalid numeric risk cannot reserve.
3. UNCERTAIN request remains risk-consuming after lease expiry until explicit reconciliation.
4. Accepted pending exposure is reconciled idempotently in the reference model.
5. Cross-symbol positions and pending orders share one modelled account risk cap.
6. USC fixture checks account-currency amounts and a single explicit USD-to-USC threshold conversion.
7. Hedging accepted / Netting rejected according to the candidate's explicit initialization requirement.
8. Missing SL / failed OrderCalcProfit paths fail closed in the candidate's portfolio risk function.
9. Compile-time hard-disable and nine mutation wrapper guards are source-checked.
10. All eight direct OrderSend call sites and one CTrade PositionModify call site are source-checked as contained within guarded wrappers.
11. Pending cancellation and partial-close wrappers are independently source-checked.

The original nine source-integrity tests also passed, for 20 total.

## Critical interpretation

The concurrency ledger in the test file is a deterministic reference model, not an MQL5 production coordinator. The one-winner result proves the model's serialized check-and-reserve behavior only. It does **not** prove that the current EA's instance-local `gState[]` reservations are atomic across charts, terminals, or hosts. That production implementation is still absent and remains a release blocker.

The so-called runtime safety checks are source-level guard/call-site audits. They are not a live MT5 interception test and do not prove the terminal emitted zero broker requests at runtime. A proper dynamic proof still requires an injectable broker adapter or Strategy Tester instrumentation around every mutating request path, with the execution hard-disable enabled.

The USC fixture is a mathematical unit test, not a live broker contract test. Actual broker denomination, tick value, contract size, profit currency, and conversion must be verified on a read-only Demo account before any execution-enabled build. The candidate explicitly rejects NETTING accounts; no netting support is claimed.

## Not run

- MT5 terminal multi-chart/multi-terminal race test.
- Cross-host central coordinator test.
- Crash/restart persistence against a real shared ledger.
- Runtime interception of OrderSend / CTrade mutations.
- Live broker USC / XAUUSDm contract fixtures.
- Real-tick Strategy Tester, sealed OOS, walk-forward, Monte Carlo, or Demo forward.

No profitability, runtime-safety, or execution-readiness claim is made. Keep PR #417 Draft; keep execution hard-disabled.
