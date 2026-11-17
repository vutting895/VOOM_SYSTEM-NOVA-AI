# NOVA v1 Master Integration — Dependency Map

- Baseline main SHA: `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`
- Feature branch: `docs/nova-v1-master-integration-release-01-20261118`
- Snapshot: repository API returned 266 branches and 314 pull requests across paginated reads. PR/branch state can change; recheck exact refs before any merge.

## 1. Integration graph

```text
Market Data + System Hub
        |
        v
Quant Engine (MTRADERS native research + SMC / Wave / ML)
        |
        v
Versioned Research Decision Contract
        |
        v
Meta Decision Layer (PR #319)
        |
        v
Trade Intent API / System Hub
        |
        v
Risk Governor + USD/account-currency normalization
        |
        v
Approval + durable audit/intent ledger
        |
        v
Demo Execution Service (PR #334; currently hard-disabled)
        |
        v
Demo Adapter / signed command contract (PR #336)
        |
        v
MT5 EA / relay (separate from read-only bridge)
        |
        v
Broker reconciliation + Journal
```

The MTRADERS EA must not become the system orchestrator. NOVA owns identity, policy, intent, approval, routing, audit and learning. MT5 is a constrained edge adapter.

## 2. Relevant PR/branch inventory

| PR | Branch / target | Scope | Current observed state | Integration note |
|---|---|---|---|---|
| #338 | `feature/nova-assistant-hybrid-readonly` → main | Hybrid Assistant | OPEN draft | Not a trading dependency |
| #337 | `ci/diagnostic-artifacts-pr333-20261116` → PR #333 branch | CI diagnostics | OPEN | Must land on its target branch before exact-head retest; do not merge directly to main as a prerequisite |
| #336 | `feat/nova-exness-demo-execution-adapter-20261116` → main | Isolated Exness Demo adapter | OPEN | Adapter policy/command validation exists; not evidence of broker order submission |
| #334 | `feature/nova-automated-demo-execution-design-20261116` → main | Demo execution service | OPEN | Explicitly hard-disabled; candidate service/intent ledger |
| #333 | `fix/nova-source-data-honesty-p0-20261116` → main | Fail-closed unverified telemetry/backtests | OPEN | Preserve; data honesty prerequisite |
| #331 | `feature/nova-service-api-hybrid-architecture-20261116` → main | System Hub API architecture/OpenAPI | OPEN | Architecture/API baseline; source contract not deployment proof |
| #329 / #318 / #283 | separate fail-closed data/training branches | Data/model honesty | OPEN | Resolve overlapping fixes; do not assume each is merged |
| #323 | `feature/nova-mt5-ai-ea-v2` → main | NOVA MT5 read-only EA baseline | CLOSED, not merged | Stale/obsolete candidate unless revived intentionally |
| #322 | `feature/nova-mt5-decision-api` → main | MT5 decision API, EA, risk reservation | OPEN | Related path; inspect against #336 before combining |
| #319 | `feat/hybrid-meta-decision-level-c-20261113` → main | Meta Decision | OPEN | Decision layer; research-only/fail-closed |
| #317 | `feature/dual-environment-trading-authority` → main | Dual environment authorization | OPEN | Security/authority prerequisite |
| #316 | `fix/nova-atomic-capacity-ownership-20261112` → main | Atomic MT5 capacity | OPEN | Critical concurrency dependency |
| #315 | `feat/nova-risk-governor-contract-20261112` → main | Risk Governor | OPEN | Risk decision contract; no activation implied |
| #310 | `feat/mt5-ea-v1.02-safe-research-20261112` → main | NOVA QUANTUM v1.02 source | OPEN | Separate research EA, not the MTRADERS v1.01 source |
| #309 | `fix/mt5-health-authenticated-e2e-20261112` → main | Authenticated bridge health | OPEN | Bridge readiness evidence |
| #308 | `feat/smc-mean-rejection-replaces-wave3-20261112` → main | Strategy direction | OPEN | Do not merge research strategies without independent OOS proof |
| #307 | `feat/nova-account-wide-order-cap-20261112` → main | Account-wide order cap | OPEN | Must align with atomic reservation |
| #305 | `feat/nova-quant-meta-decision-v2-20261112` → main | Meta decision + P/D gates | OPEN | Potential overlap with #319; choose one canonical contract |
| #302 | `feat/nova-mtraders-hybrid-strategy-20261111` → #297 branch | 30-module research engine | OPEN | Depends on #297 base; not directly based on main |
| #297 | `feat/nova-mtraders-ea-execution-adapter-20261111` → main | MTRADERS safe baseline + validators | OPEN | Source safety baseline; no actual order send |
| #288 / #277 | USD normalization variants | Risk currency normalization | OPEN | Resolve canonical branch; verify cent-account handling |
| #287 / #286 / #269 | MT5 History API / reconnect variants | Read-only history | OPEN | Select one canonical implementation; avoid duplicate endpoints |
| #281 | `audit/real-auto-ea-safety-contract-20261111` → main | Real Auto safety contract | OPEN | Policy doc, not execution evidence |
| #280 / #279 / #278 | MT5 read-only risk metadata / flatten contracts | Advisory and position management contracts | OPEN | Do not infer broker mutation capability |
| #276 | `policy/exness-demo-automated-execution-20261111` → main | Demo execution boundary | OPEN | Must reconcile with #334/#336 |
| #238 / #291 | XAUUSD historical data | Data continuity/export | OPEN | Dataset quality gate remains separate from EA integration |

## 3. Confirmed dependency and duplication risks

1. PR #302 targets PR #297's branch, not main. Its hybrid engine must be reviewed against the exact #297 commit and cannot be treated as an independent main-ready change.
2. PR #297 provides intent/close validation but explicitly does not implement order send, durable remote authentication, or actual close execution.
3. PR #334 and #336 are separate execution components. Their contracts must be reconciled before any combined runtime is considered; duplicate intent ledgers or incompatible command TTL/signature contracts are release blockers.
4. PR #322 adds another MT5 decision API / EA route. Compare its relay, risk reservation, and EA contracts with #336 and #297 before choosing the single supported path.
5. PR #315, #316, #307, #277, and #288 cover overlapping risk/atomic capacity/currency concerns. Select one canonical policy and one account-scoped reservation implementation.
6. PR #305 and #319 overlap in Meta Decision scope. Choose a single versioned contract and preserve other work as research or superseded candidates.
7. Multiple History API and reconnect branches exist (#269/#286/#287). Do not merge multiple variants without contract and test reconciliation.
8. PR #323 is closed unmerged. Its EA source must not be treated as current merely because the branch still exists.

## 4. Recommended integration order

- Gate A: preserve PR #333 data-truthfulness; inspect #337 diagnostic dependency and exact-head evidence.
- Gate B: settle System Hub contract (#331) and one canonical market-data/history path.
- Gate C: select one canonical Meta Decision contract (#319 or #305) and one research engine candidate (#302 after #297 review).
- Gate D: settle currency normalization and atomic account-wide reservation (#277/#288, #307/#316).
- Gate E: settle approval/audit lifecycle and Demo authority (#67, #235/#236/#239, #317).
- Gate F: reconcile execution service (#334), Demo adapter (#336), and MT5 decision/EA route (#322) into one path.
- Gate G: only after source, compiler, unit/integration, Demo lifecycle, and broker reconciliation proof, consider a separately approved Demo enablement release.

No PR is merged or closed by this document.
