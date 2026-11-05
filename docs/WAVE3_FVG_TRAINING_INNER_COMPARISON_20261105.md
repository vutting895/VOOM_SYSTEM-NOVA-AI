# Wave3 FVG training / inner walk-forward event comparison

- Captured: 2026-11-05
- Challenger PR: #147
- Exact code head: `e04cc453b8345dad84a2f4e15f73ff2170fb834f`
- Ubuntu/Python 3.11 run: [42051432406](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42051432406) — SUCCESS
- Dataset source commit: `507b2949e3fa1861f25262cc330fb84a28c96f3d`
- Dataset SHA-256: `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`
- Report artifact: `wave3-fvg-training-inner-comparison`, artifact ID `13426916680`
- Artifact ZIP SHA-256: `b61f76176721fe16dad2e5ad7e4938b0e0fb27bd0baeaefd06c3bc900ea42295`
- Extracted JSON SHA-256: `3e7566eec3cd03341a68da14eead9f90a7d4a423b54116caaf7cc43d251c8113`

## Analysis boundary

Only XAUUSDm M15 bars strictly before `2026-07-01T00:00:00Z` were converted to OHLC and supplied to the FVG trace. Parser stopped at the first Final-OOS timestamp. The output reports `final_oos_rows_parsed=0`, `final_oos_ohlc_converted=false`, and `final_oos_model_metrics_used=false`. The full-file SHA-256 was used only for source-integrity verification; no Final-OOS OHLC or labels entered the comparison.

## Definitions (all retained; no winner selected)

1. **first_touch_only** — one event at the first post-confirmation candle-range overlap.
2. **first_full_mitigation_only** — one event at the first post-confirmation candle low reaching/crossing the lower FVG boundary; later retouches do not reactivate.
3. **repeat_touch_within_48** — every candle-range overlap with the most recent bullish FVG while its age is 1–48 bars; comparator for existing repeat-touch behavior.

## Results

| Window | Bars | FVG creations | First touch | First full mitigation | Repeat touch | Post-full retouch bars |
|---|---:|---:|---:|---:|---:|---:|
| Pre-OOS pool (to 2026-07-01) | 93,122 | 10,307 | 6,243 | 5,201 | 32,563 | 20,345 |
| Inner fold 1 validation | 12,091 | 1,404 | 820 | 667 | 4,166 | 2,532 |
| Inner fold 2 validation | 12,091 | 1,393 | 851 | 700 | 4,196 | 2,616 |

### Event rates per 1,000 bars

| Window | First touch | First full mitigation | Repeat touch |
|---|---:|---:|---:|
| Inner fold 1 | 67.819 | 55.165 | 344.554 |
| Inner fold 2 | 70.383 | 57.894 | 347.035 |

The three incidence rates are directionally similar between the two inner validation windows. Repeat-touch creates roughly five times as many events as first-touch, and a material number of overlap bars occur after a prior full mitigation. This diagnoses the impact of repeat-touch semantics; it does **not** establish that any definition improves trade outcomes.

## Decision

- **No FVG definition selected.**
- No labels, trade outcomes, net expectancy, or model training were generated.
- Frozen v6.2.6.3 feature matrix and scoring gates were not modified.
- Next step is cost-complete label generation only after the account-specific commission subtype and a timestamped historical swap/rollover model are independently verified.
- The new six-month future holdout remains sealed; it must not be used before 2027-05-07 UTC and is not included in these counts.
