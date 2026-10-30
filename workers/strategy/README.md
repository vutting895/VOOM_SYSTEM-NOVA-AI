# NOVA Strategy Registry

The versioned customer catalog lives in `frontend/data/nova-strategy-catalog.v1.json`.
The browser consumes it through `frontend/lib/customer-strategies.mjs`; Python
research services validate the same document through `workers/strategy/catalog.py`.

## Current strategy readiness

| Strategy | Current state | Research operations | Evidence boundary |
|---|---|---|---|
| SMC Precision | Research only | Analyze, baseline backtest | Existing SMC analyzer and cost-aware structure-break baseline are heuristics; no profitability approval |
| Wave3 Confluence | Blocked | None | PR #66 is Draft/unmerged and its recorded Final OOS run has zero trades and fails the majority baseline |
| AI Market Scout | Catalog only | None | No tested strategy adapter exists on main |

Customer preferences are not authorization. The NOVA System Integration Hub must derive
owner/tenant identity and authorize access independently. Never trust a model-supplied
user ID, tenant ID, broker connection, route, or permission.

## Safety

This registry compiles research-only run specifications. It does not fetch data, train
models, invoke the SMC engine, persist customer preferences, access broker credentials,
or submit orders. All trade authorization, execution, order submission, and live-trading
flags are hard false. Research approval never authorizes broker writes.

## Next milestones

1. Reconcile Quant Engine PR #94 and connect immutable dataset/run manifests.
2. Fix and test point-in-time feature generation before using SMC/FVG/OB fields in model labels.
3. Reconcile Wave3 PR #66, preserve all frozen gates, and rerun walk-forward plus untouched Final OOS.
4. Implement Research Core source/evidence/experiment lifecycle under issue #96.
5. Add owner-scoped persistence and a review/promotion/rollback state machine only after the existing NOVA Hub authorization and approval contracts are integrated.


## Point-in-time safety requirements for the existing SMC source

The current `workers/feature/smc_wave/smc_strategy.py` implementation has an important feature-lineage boundary:

- The FVG `mitigated` flag and OB `mitigated_after_confirmation` flag are calculated using suffix extrema from candles later than the zone/event. They are retrospective diagnostics and MUST NOT be used as point-in-time features for historical decision rows.
- A future adapter must use only events available as of each decision timestamp, preserve pivot `confirmed_at` / structure-event indices, and calculate any mitigation state using only candles observed up to that timestamp.
- The existing structure-break backtest enters at the next candle open and applies a conservative stop-first rule when stop and target are both touched in one candle. It remains a research baseline, not an execution simulator.
- Its current PnL is per-unit and its cost model includes configured fee/slippage only. Spread, symbol contract sizing, lot/quantity constraints, swap/funding, session calendar, and provider-specific fills must be added from point-in-time source metadata before interpreting portfolio returns or claiming strategy performance.

Until those adapter and evidence requirements pass, SMC stays research-only. No mitigation feature may bypass causal validation, and no result grants broker-write or live-trading authority.
