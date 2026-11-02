# Wave3 P2 First-Hit Label Review — 2026-11-02

Status: **BLOCKED — design/code review only; no benchmark training, no strategy changes.**

## Provenance and separation

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Main at review: `a9bb92c9d2642eff34be2ea68276a33b367ee793`
- Research branch: `research/wave3-positive-edge-architecture-20261031`
- PR #147 reviewed head: `58ef328600a3d69575b73d9ae71e5d689d54c965` (current exact head at revalidation)
- PR #147 is a separate research workstream. Do not copy PR #66 implementation into this branch.
- Reviewed implementation: `research/wave3_challenger/first_hit_labels.py`
- Review is not a training run, benchmark result, approval, or promotion.

## P2 implementation facts

The current first-hit label builder:
- Generates BUY-only labels and requires a next-bar entry trigger.
- Uses fixed defaults: stop $5, target $11, 12 M15 bars, 0.01 lots, contract size 100, and $0.02 per-side slippage.
- Requires a commission value and a caller-provided `commission_verified=True` flag.
- Charges the observed spread at BUY entry, one-side slippage at each fill, and two-sided commission.
- Resolves same-bar stop/target ambiguity as stop-first.
- Censors labels whose 12-bar horizon is incomplete.
- Explicitly assumes barrier-price fills for gaps; gap-through execution is not modeled.
- Does not include swap/rollover in net PnL.
- Exposes daily entry-count and daily-loss limits.

## Blocking findings

### P2-1 — BUY-only labels do not represent a symmetric three-class strategy
The current implementation can only construct BUY outcomes. It cannot establish SELL/short labels or validate whether the proposed three-class outcome distribution is directionally symmetric. Do not treat its metrics as a complete Wave3 strategy benchmark.

### P2-2 — Gap-through execution is not modeled
The current code fills at the stop/target barrier plus slippage even if the next OHLC bar opens beyond that barrier. This can overstate realized PnL and understate tail loss. A preregistered conservative gap-fill rule is required before cost-complete labels can be accepted.

### P2-3 — Swap/rollover is omitted
The source dataset metadata records swap mode 1, long swap -492, short swap 0, and three-day rollover. The 12-bar horizon is three hours, but it can cross the broker rollover boundary. A blanket assumption that all trades avoid swap is unsupported. Net PnL is not yet fully cost-complete.

### P2-4 — Daily loss accounting uses inconsistent dates
The implementation checks the loss limit using the entry date (`daily_net[entry_day]`) but accumulates realized PnL under the exit date (`daily_net[exit_day]`). Trades crossing UTC midnight can therefore bypass or misattribute the daily loss cap. Define whether risk limits are based on entry-day cohort or realized UTC trading day, then use that same key consistently.

### P2-5 — Commission verification is caller-asserted
A Boolean `commission_verified=True` and free-text source do not independently prove the actual Exness Demo commission schedule. Attach a versioned broker contract/commission evidence reference and reject missing or stale evidence.

## Required preregistration before P2 implementation

1. Specify BUY and SELL entry/fill semantics, including Bid/Ask conversion and spread treatment.
2. Specify gap-through stop and target fills, stop-first ties, partial bars, and end-of-data censoring.
3. Specify commission per side, swap/rollover day and triple-rollover treatment, slippage, and all net-PnL terms.
4. Define daily entry caps and daily loss accounting timezone/key, including trades crossing midnight.
5. Define overlap policy and whether a new signal can be considered while an earlier label remains open.
6. Freeze all values and rules in a versioned methodology file before running label generation.
7. Add adversarial tests for gaps, midnight crossings, rollover, both directions, same-bar barriers, incomplete horizons, and cost evidence expiry.
8. Run nested chronological walk-forward with 12-bar purge; fit/tune/calibrate only on inner folds. Keep final OOS from 2026-07-01 untouched.

## Gate decision

**P2 remains BLOCKED.** Do not start another full benchmark training. Do not change v6.2.6.3 weights, lookbacks, thresholds, SMC gates, entry/risk/news gates, or the frozen final OOS. Do not alter PR #66 or merge either PR.

The existing Run #6 diagnostics remain the only benchmark evidence cited in this review; they are from training commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, not the current PR #66 head. This review creates no new accuracy, trade, net-profit, or Profit Factor result.
