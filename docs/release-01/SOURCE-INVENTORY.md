# NOVA v1 Master Integration — Source Inventory

- Baseline: `main` SHA `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`
- Branch: `docs/nova-v1-master-integration-release-01-20261118`
- Inventory method: GitHub repository tree, file-content inspection, PR changed-file lists, branch/PR metadata.
- Important: this is a source-tree inventory, not proof of build, deployment, connectivity, or runtime behavior.

## 1. All-in-One source findings

| Path / artifact | Observed evidence | Assessment |
|---|---|---|
| `integrations/mt5/MTRADERS_All_In_One_v1.01.mq5` on main | MQL5 source; 30 module names; `InpTradeEnabled=true`; 5% per-trade, 10% single-risk cap, 30% aggregate risk, 30 positions, 35% daily loss; `OnTick()` is an empty stub | BLOCKED — unsafe defaults and no executable strategy/trading lifecycle |
| Same path on PR #297 branch | Safe research copy; `InpTradeEnabled=false`; 1% per-trade candidate, 1% single cap, 9% aggregate risk, max 5 total exposure orders, 10% daily loss; still non-executing | IN PROGRESS — safer source candidate, not merged or compiled |
| `workers/quant_engine/mtraders_strategies.py` on main | 30 labels; deterministic placeholder score formula based on strategy ID and RSI; fallback close/ATR defaults | BLOCKED — not faithful implementations of the original 30 strategies; do not use as production signal |
| `workers/quant_engine/mtraders_native.py` on PR #302 branch | Newly authored deterministic research implementations; explicitly says these are not source decompilations of the original module logic | IN PROGRESS — research candidate only; requires review and reproducible tests |
| `workers/quant_engine/mtraders_hybrid.py` on PR #302 branch | Regime-aware selector, model weights and quality-receipt checks | IN PROGRESS — research selector; not execution authority |
| `workers/quant_engine/mtraders_contract.py` on PR #302 branch | Versioned research-only decision envelope; explicitly requires execution flags false | IN PROGRESS — candidate contract |
| `workers/quant_engine/mtraders_backtest.py` on PR #302 branch | Next-bar-open, one-bar-hold, cost-aware research backtest | IN PROGRESS — does not by itself establish OOS validity or live performance |
| `integrations/mt5/nova_execution_contract.py` on PR #297 branch | Pure Python intent validator; Exness Demo identity, tenant/account binding, short TTL, symbol allowlist, SL/TP geometry, risk and order-count checks | IN PROGRESS — validation only; no broker submission |
| `integrations/mt5/nova_position_lifecycle.py` on PR #297 branch | Pure close planner for NOVA-owned Magic range | IN PROGRESS — planner only; durable idempotency and actual close are absent |
| `integrations/mt5/NOVA_QUANTUM_v1.02.mq5` on PR #310 branch | Separate ALPHA/SOURCE_ONLY research source | IN PROGRESS — not interchangeable with MTRADERS v1.01; static review says no strategy pipeline or OnTick execution |

## 2. Existing NOVA integration surfaces on main

| Path | Role | Limitation |
|---|---|---|
| `integrations/mt5-readonly-bridge/bridge.py` | Windows MT5 read-only bridge | Read-only path; not an execution adapter |
| `integrations/mt5-readonly-bridge/bridge_relay_client.py` | Relay client | Keep tenant-bound; inspect exact runtime configuration before any integration |
| `integrations/mt5-bridge-relay/worker.js` | Cloudflare relay | Existing read-only relay must not be repurposed into an unauthenticated write path |
| `integrations/system-hub/worker.js` | NOVA control-plane API | Public gateway/control plane, not a broker order endpoint |
| `workers/execution/ccxt_exec.py` | Crypto exchange execution prototype | Must not be assumed production-ready or authorized; separate exchange adapter and Demo/paper gates required |
| `workers/risk/manager_prototype.py` | Risk prototype | Not proof of active production policy |
| `shared/schemas/risk-decision.schema.json` | Shared risk decision schema | Contract/schema presence does not prove enforcement in every adapter |
| `docs/openapi/nova-video-api.yaml` | Video API contract | Not the trading API contract |

## 3. All-in-One repository / binary search

- The inspected NOVA main tree contains the MQL5 source path above.
- The recursive main tree search did not find an `.ex5` binary.
- GitHub repository search for a separate repository named/described as “MTRADERS All In One” returned no result in the connected search scope.
- This does not prove that no local, private-unindexed, archived, or externally hosted EA package exists.
- No binary was compiled or installed during Release 01.

## 4. Evidence-based status

| Work item | Status | Evidence / reason |
|---|---|---|
| Locate MTRADERS MQL5 source in NOVA | DONE | Main tree + fetched source |
| Inspect source defaults and tick handler | DONE | Source content inspected |
| Locate Python 30-module port | DONE | Main tree + fetched source |
| Verify true 30-strategy implementation | BLOCKED | Main Python module is a deterministic placeholder; PR #302 is a newly authored research port, not original logic |
| Locate safe MTRADERS source candidate | DONE | PR #297 changed file list + fetched branch source |
| Verify MetaEditor compilation | BLOCKED | No compiler log/build artifact reviewed |
| Verify Strategy Tester / Exness Demo lifecycle | BLOCKED | No reproducible run evidence reviewed |
| Find a separate All-in-One repository | BLOCKED | Search returned no result; local/external locations not accessible |
| Find `.ex5` binary in current main tree | DONE (negative finding) | Recursive tree contains no `.ex5` path |

## 5. Required next evidence

1. User's authoritative original All-in-One source package, if different from the NOVA MQL5 file.
2. Source provenance and licensing/redistribution confirmation for the original strategy modules.
3. Reconciliation of the user's local EA and PR #297 safe source.
4. MetaEditor compiler version, exact compile command/log, and artifact hash.
5. Strategy Tester test configuration and result files.
6. Exness Demo-only end-to-end lifecycle evidence with order submission still disabled until separately authorized.
