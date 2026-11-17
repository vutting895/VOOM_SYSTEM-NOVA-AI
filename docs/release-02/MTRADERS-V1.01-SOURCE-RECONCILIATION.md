# Release 02 — MTRADERS v1.01 Canonical Source Reconciliation

- Decision: use PR #297 `feat/nova-mtraders-ea-execution-adapter-20261111` as the canonical MTRADERS v1.01 source baseline.
- Integration branch: `integration/nova-v1-release-02-mtraders-source-20261118`
- Release 01 parent: `fe9a9132d9857e44c4922449279050731536bf09`
- Main baseline rechecked: `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`
- PR #297 source head inspected: `4ab551d2212b507b601d19211fd684842432f60c`
- PR #297 state: OPEN, Draft, unmerged.
- Scope: source selection and feature-branch reconciliation only. No deployment, no merge, no broker mutation, no Production Risk Policy change, no Demo/Live execution enablement.

## 1. Canonical source files adopted on this branch

| File | Source ref / blob SHA | Integration action |
|---|---|---|
| `integrations/mt5/MTRADERS_All_In_One_v1.01.mq5` | PR #297 / `deddc1adc7a9efe9922d8097d34da75be25213a4` | Replaced unsafe main version on this feature branch |
| `integrations/mt5/nova_execution_contract.py` | PR #297 / `e8598daa24e790efe2fe4aa6c151caba7f4a49db` | Added |
| `integrations/mt5/nova_position_lifecycle.py` | PR #297 / `9aa41f3fb5b284c170297cf310827b068f9574fe` | Added |
| `tests/test_nova_execution_contract.py` | PR #297 / `4c2d0180722703d066f452f182b20d3f4c4222c1` | Added |
| `tests/test_nova_position_lifecycle.py` | PR #297 / `f01a55be779db04fccac6ffe269a7c695e205397` | Added |

The original placeholder `workers/quant_engine/mtraders_strategies.py` was deliberately NOT adopted as a strategy implementation. It calculates a modulo/RSI placeholder score and is not faithful strategy logic.

## 2. Safety properties verified by source inspection

- `InpTradeEnabled=false` by default.
- `OnInit()` returns `INIT_FAILED` if the legacy trade-enable input is switched on.
- Candidate defaults in the EA: 1% risk, 1% single-trade cap, 9% aggregate open risk, 10% daily loss, bounded minimum lot disabled.
- Account exposure helper counts all open positions plus all active pending orders, across symbols and Magic Numbers, with a hard cap of 5.
- `OnTick()` intentionally contains no strategy evaluation or order logic.
- Python intent validator is side-effect-free and explicitly validates Exness Demo, USD account currency, tenant/account binding, allowlisted symbol, NOVA Magic range, command TTL/replay set, quote age, SL/TP geometry, risk and exposure.
- Position lifecycle module is a validation-only close planner for explicit NOVA-owned position tickets; it does not call a broker API.

These are source-level observations only. They do not establish compilation, runtime behavior, authenticated transport, atomic reservation, or broker reconciliation.

## 3. Critical blockers and design gaps

### A. PR #297 is stale relative to current main

GitHub compare of current `main` (`30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`) against PR #297 head (`4ab551d2212b507b601d19211fd684842432f60c`) reports:

- 12 commits ahead
- 34 commits behind
- status: diverged
- merge base: `3105ad79990fa6596d1e210e7a645b0b0e12e5fa`

Therefore PR #297 itself must not be merged or rebased blindly. This Release 02 branch is based on the Release 01 branch at current-main baseline and selectively adopts the inspected files, rather than importing the stale PR branch history.

### B. EA is a safe scaffold, not an executable trading EA

- No strategy calculation pipeline is present in the inspected v1.01 file.
- `OnTick()` is empty.
- No OrderSend/Trade class submission, modify, or close call exists.
- The 30 enum/registry names do not prove 30 working strategies.
- No MetaEditor compiler output or Strategy Tester evidence was supplied.

### C. Python validator is not a production execution gate

- Account currency is hard-coded to USD; USC/cent accounts are rejected. This is fail-closed, but not yet compatible with cent-account normalization.
- Replay prevention uses a caller-supplied in-memory set, not a durable transactional idempotency store.
- Exposure count is supplied in a RiskSnapshot; the module does not authenticate the source or atomically reserve account capacity.
- The validator has no network authentication, signing, audit persistence, broker adapter, or order submission.

### D. Close planner is not a close executor

- The consumed command ID set is caller supplied and non-durable.
- It does not authenticate a remote caller or connect to the broker.
- It does not close positions or reconcile broker results.

### E. Asset coverage

The EA is attached to a single MT5 symbol/chart and the validator is broker/symbol allowlist based. This does not constitute completed Forex + Gold + Crypto integration. Crypto exchange execution remains a separate adapter and policy boundary.

## 4. PR #302 relationship

PR #302 remains stacked on PR #297. Its own description explicitly states the MQL5 source has module names/registration only and empty `OnTick()`; the 30 Python strategy baselines are newly authored approximations inspired by module names, not extraction/decompilation of original strategy logic.

Decision:
- Preserve PR #302 as a separate research candidate.
- Do not copy its strategy engine into this branch yet.
- First define module-by-module source fidelity, market-data schema, unit tests, and dataset quality receipt requirements.
- Do not treat PR #302 as a dependency required to compile the MQL5 safety scaffold.

## 5. Required gates before any execution work

1. Reconcile PR #297 safety source against current main changes and inspect conflicts by file; do not merge the old PR history.
2. Add durable idempotency and account-scoped atomic capacity reservation.
3. Replace caller-trusted exposure/risk snapshots with authenticated broker snapshots and server-owned policy evaluation.
4. Design verified account currency and contract-value conversion; do not silently reinterpret USC as USD.
5. Define authenticated Demo-only command transport, signature/key rotation, nonce/replay handling and append-only audit.
6. Add a separately reviewed MQL5 adapter; keep this EA's `OnTick()` non-executing until the full gate is approved.
7. Compile with native MetaEditor on Windows and retain compiler version, log and artifact SHA.
8. Run Strategy Tester and controlled Exness Demo lifecycle tests with evidence for reject, partial fill, disconnect, restart/replay, close, and reconciliation.
9. Keep `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false` until separately approved.

## 6. Status

| Work item | Status | Evidence |
|---|---|---|
| Canonical source decision | DONE | User confirmation in conversation |
| Main SHA check | DONE | Current Git ref checked |
| PR #297 state/head/base inspection | DONE | GitHub PR metadata |
| PR #297 source inspection | DONE | Five source/test files fetched |
| Adopt MQL5 v1.01 safe source on feature branch | DONE | Update commit `278b5a535830ebc39e04e36c62f52267b55f0697` |
| Adopt Python validation modules and tests | DONE | Four add commits recorded |
| Preserve original 30-strategy implementation | BLOCKED | Source only has names; no faithful module logic verified |
| PR #297 branch history reconciliation | IN PROGRESS | PR branch is 34 commits behind current main; selective file adoption used |
| Python tests executed | BLOCKED | No test runner execution evidence in this task |
| MetaEditor compilation | BLOCKED | No native compiler evidence |
| Demo execution lifecycle | BLOCKED | No broker lifecycle evidence; execution remains disabled |
| Production/Live changes | NOT PERFORMED | Explicitly out of scope |

Release 02 is a source reconciliation checkpoint, not a trading release.
