# Wave3 P2 First-Hit Label Review — revalidated 2026-11-03

Status: **BLOCKED — isolated challenger code is unit-tested, but net outcomes are not yet cost-complete or supported by broker cost evidence.** No benchmark training, final-OOS access, promotion, or strategy-gate changes are authorized.

## Provenance and workstream isolation

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Default branch: `main`
- Current main SHA at revalidation: `4480d3bf6fa8f390b09334091f697d8359e79085`
- Challenger branch: `research/wave3-positive-edge-architecture-20261031`
- P2 implementation remains isolated to PR #147:
  - `research/wave3_challenger/first_hit_labels.py`
  - `tests/test_wave3_challenger_first_hit_labels.py`
- PR #66 remains the frozen v6.2.6.3 benchmark workstream. No P2 implementation is copied into PR #66.

## Agreed P2 target and current implementation

The preregistered challenger target is BUY-only and uses three realized-outcome classes: `stop_first`, `target_first`, and `time_exit`. SELL/short symmetry is not part of this P2 acceptance contract; any SELL research must be a separately preregistered workstream.

Current isolated builder behavior:

- Evaluate a signal only after its M15 bar closes; enter on the next bar only if the frozen trigger is reached.
- Fixed defaults: $5 stop, $11 target (2.2R), 12 inclusive M15 bars, 0.01 lots, contract size 100, and $0.02 slippage per side.
- Charge the observed Bid-OHLC spread at BUY entry, one-side slippage at each fill, and caller-supplied two-sided commission.
- Resolve same-bar stop/target touches conservatively as stop-first.
- Censor incomplete 12-bar horizons rather than fabricating a time exit.
- Enforce one open position, five entries per UTC day, and the $500 daily realized-loss stop.
- Keep output challenger-only; it does not generate signals, replace benchmark labels/features, train a model, or submit orders.
- Mark MAE/MFE as OHLC bar-range bounds, not tick-accurate intrabar excursions.

## Review adjudication

### P2-1 — SELL requirement

**Not a blocker for this agreed scope.** The preregistered P2 contract is explicitly BUY-only and its outcome classes are `stop_first`, `target_first`, and `time_exit`. Requiring SELL rules would expand scope and delay the agreed BUY first-hit label methodology. SELL remains separate and unimplemented.

### P2-4 — Daily realized-loss accounting

**Not a defect under the stated daily-realized-loss policy.** The builder checks realized PnL already booked on the executable entry's UTC date, and books a closed trade's realized PnL on its exit UTC date. A trade crossing midnight therefore belongs to the day it closes; a later entry on that exit day sees the realized loss. The one-position rule prevents a second entry while the first trade remains open.

A regression test has been added for a 23:45 UTC signal that enters and stops at 00:00 UTC, followed by a same-day entry attempt. The expected result is that the first loss is booked on 2026-01-02 and the second entry is blocked by that day's realized-loss limit. The previous exact-head P2 CI #29 passed 12 tests on the prior PR head; this new midnight-loss test requires a fresh exact-head CI result.

## Remaining P2 blockers

1. **Gap-through fills (partial remediation):** subsequent-bar opening gaps now use conservative fills: stop gaps execute at the worse opening Bid, while target gaps are capped at target; entry-bar opens are excluded because they predate the trigger fill. Adversarial tests cover both directions and the OHLC sequencing caveat. Exact-head CI is pending. This does not make the entire execution model tick-accurate.
2. **Swap/rollover:** swap is not modeled. A 12-bar M15 holding period can cross broker rollover; the dataset metadata's symbol-spec fields do not, by themselves, establish the applicable realized swap charge for each trade. Obtain and model the account-specific rollover schedule and applicable long-swap charge, or prove eligibility excludes rollover.
3. **Commission evidence:** `commission_verified=True` and a free-text source are caller assertions, not independent broker evidence. Attach a dated, versioned Exness Demo commission schedule and verify the amount and charging basis before generating accepted labels.
4. **Real-data integration:** current passing tests use synthetic fixtures. No real Exness first-hit labels have been accepted, and the builder has not been integrated into a challenger dataset/schema/manifest.
5. **Final holdout:** the benchmark period beginning 2026-07-01 has already been inspected and cannot be presented as a never-seen challenger final holdout. Preregister a genuinely new future holdout before challenger acceptance.

## Validation and safety

- Previous dedicated P2 CI: [run #29](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41467941243), successful on prior head `df2e2c92d97eccdb8f768b64a3facdc9c1e9118f`; 12 tests passed. It does not cover the newly added exit-day loss test.
- The new regression test and this review update are isolated to PR #147. Fresh exact-head P2 CI is required before claiming the update is validated.
- No full benchmark training, final-OOS tuning, broker order, live trading, deployment, or merge was performed.
- Keep PR #147 Draft/open/unmerged. Keep PR #66 independent and unchanged by challenger implementation.


## P2 gap-through implementation update — 2026-11-04

The PR #147 label builder now records and models subsequent-bar opening gaps without changing the BUY-only contract: a stop gap fills at the worse opening Bid less exit slippage; a target gap is capped at the target less exit slippage. The entry bar's open is not used because it predates the trigger fill. Three adversarial regressions cover stop gap, target gap, and entry-bar sequencing. Exact-head P2 CI is pending for this update.

The remaining P2 acceptance blockers are unchanged: independently verified Exness Demo commission amount/basis, applicable account-specific swap/rollover charges, real Exness label/schema/manifest integration, and a preregistered future untouched holdout. No synthetic fixture is accepted as broker evidence.
