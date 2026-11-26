# NOVA EA v1.83 — Phase 1–2 Repair Plan

**Status:** Contract defined; candidate fail-closed gate compiled. NOVA risk-policy implementation remains outstanding.
**Base:** `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`
**Working branch:** `audit/ea-v183-phase1-2-20261125`

## Phase 1 — Source integrity

1. Re-capture complete SHA-256, byte size, line count, timestamps, and file metadata for every v1.83 MQ5 and EX5 variant.
2. Preserve original files read-only. Create a separate version-controlled research copy; never patch the installed file in place.
3. Compare all variants with a semantic diff, not only line-based comparison. Identify changed inputs, globals, execution functions, event handlers, and compile directives.
4. Map each MQ5 to its EX5 using compile logs, compiler version, build timestamp, and hash. If the mapping cannot be proven, classify the EX5 as unverified.
5. Check whether any EA source or binary is already present in the repository before importing. Avoid duplicate copies and do not infer source provenance from filenames.
6. Produce a source manifest containing complete hashes and provenance. This manifest is the prerequisite for code repair.

**Exit criteria:** complete source inventory, immutable originals, reproducible diff, and source/binary mapping. No production file is changed.

## Phase 2 — Safety and risk repair

### 2.1 Hard execution gate

Implement a single fail-closed execution gate used by every order-mutating path, including open, close, partial close, modify SL/TP, pending orders, hedge, averaging, recovery, and overlap close.

Required behavior:
- Default execution mode is disabled.
- Read-only mode is immutable at compile-time for the read-only build.
- A disabled execution gate rejects every trade-mutating operation before any broker request is sent.
- No UI toggle, stale runtime flag, input default, recovery branch, timer, or fallback may bypass the gate.
- Log a structured rejection reason; never silently fall through to an alternate order path.
- Keep analysis, quote reads, history reads, and journal export available in read-only mode.

Do not rely on one call-site check. Add a centralized broker adapter and static checks that enumerate all trade-mutating API calls.

### 2.2 NOVA risk contract

Target policy to implement and test:

| Control | Required policy |
|---|---:|
| Daily loss threshold | 10% of broker-day starting equity |
| Daily loss action | Entry Lock Only; do not flatten existing positions |
| Maximum aggregate open risk | 9% |
| Maximum open orders/positions | 5 (define and test the counting semantics) |
| Live trading | OFF by default and blocked until production gate |

The daily-loss lock must prevent new entries while allowing only explicitly permitted risk-reducing management actions. Do not treat closing, reducing, or protecting an existing position as a new entry. Daily baseline must be persisted and keyed to broker-day boundaries and account identity; test restart and day-rollover behavior.

### 2.3 Recovery threshold semantics

The current implementation was observed using `MathMax` in recovery threshold calculations while comments describe a first-threshold-reached policy. Do not mechanically replace every `MathMax` with `MathMin`.

First define each trigger, target, and hard-stop semantic independently:
- Trigger: if either money or percentage threshold should activate recovery, select the earlier/less restrictive threshold only after confirming units and sign conventions.
- Target: define whether both targets must be met or either target is sufficient.
- Hard stop: define whether the earliest protective limit must win.
- Test positive, negative, zero, cent-account, USD-account, and equity-change cases.

Recovery remains disabled until all semantic tests and risk-limit tests pass. No martingale or averaging expansion is permitted as a workaround.

### 2.4 Order sequencing and failure handling

For overlap close, partial close, and multi-leg operations:
- Treat each broker request as independently fallible.
- Reconcile actual position volume and realized P/L after each request.
- Do not assume a second leg succeeded because the first succeeded.
- Do not repeat a request without checking the broker result and current position state.
- Prefer atomicity where the broker supports it; otherwise use an explicit state machine and compensation policy.

### 2.5 Required tests

- Read-only: every trade-mutating operation rejected; zero broker requests emitted.
- Gate bypass: direct, indirect, timer, UI, recovery, and error-retry paths all rejected.
- Entry Lock: new entries rejected at/above 10% daily loss; existing positions are not force-closed by the daily guard.
- Risk cap: aggregate open risk never exceeds 9%.
- Position/order count: sixth entry rejected; partial closes and pending orders counted according to the agreed contract.
- Restart: daily baseline and lock state survive EA/terminal restart.
- Broker day rollover: baseline resets exactly once at the broker's day boundary.
- Recovery: money/percentage boundaries, cents conversion, sign handling, and hard-stop precedence.
- Partial failure: first/second leg success/failure permutations, duplicate responses, timeout, requote, and stale position state.
- Regression: analysis and journal export still operate in read-only mode.

## Non-goals for this phase

- No live trading enablement.
- No change to installed EA files or chart attachments.
- No automatic merge to `main`.
- No claim of profitability or OOS validation.
- No ONNX/XGBoost/LSTM/Vision runtime claims.

## Release gate

Phase 2 is complete only when the code review, static call-site audit, compile, unit tests, negative tests, integration tests, and MT5 Demo read-only verification all have inspectable evidence. Passing compile alone is insufficient.

## Current implementation evidence (2026-11-25)

- Phase 1 source archive created at `integrations/mt5/ea-research/v1.83/source-variants/` with five MQ5 variants and full SHA-256 manifest.
- Phase 2 read-only research candidate created separately at `integrations/mt5/ea-research/v1.83/candidate/`; it is derived from WORKING and is not an installed EA.
- Static audit found 9 broker-mutating API calls in WORKING: 8 `OrderSend()` calls and 1 `PositionModify()` call. Early compile-time disable guards were inserted into the 9 containing functions plus `TradePermission()`.
- Candidate compiled with MetaEditor at `C:\MT5\metaeditor64.exe`: 0 errors, 3 warnings. Warnings are two deprecated `POSITION_COMMISSION` uses and one possible `long` to `double` conversion.
- New source-integrity and candidate-gate test file: 5 tests passed.
- Not yet completed: runtime zero-broker-request proof, full Daily Entry Lock Only implementation, 9% aggregate open-risk cap, max-5 position contract, Recovery semantic repair, and MT5 Demo integration tests.

- Updated candidate compile: **0 errors, 3 warnings** after the risk-policy and Sniper aggregation changes.
- Expanded source-integrity suite: **7 passed, 0 failed**. Added static assertions for Entry Lock Only behavior, 10% daily loss, 9% aggregate open risk, maximum five positions, Recovery/Sniper risk checks, and inclusion of the separate Sniper magic in portfolio totals.
- Runtime zero-order-request proof and broker-day restart/rollover tests remain pending.
