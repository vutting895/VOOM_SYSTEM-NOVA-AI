# NOVA EA v1.83 — Source Baseline

**Status:** Immutable research archive; no production EA fixes applied. A separate fail-closed candidate exists.
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`
**Base:** `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`
**Working branch:** `audit/ea-v183-phase1-2-20261125`

## Provenance

Source files were copied from the connected Windows MT5 terminal folder:

`MQL5/Experts/nova v.1.83/`

The original installed files were not modified. The copies are under:

`integrations/mt5/ea-research/v1.83/source-variants/`

## Captured source hashes

| File | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| `Nova_EA_v1_83.mq5` | 525635 | 8054 | `4D8838B6868CDB3509F01EC922D4F5787445896015E34BB3C1E61946B3EE0319` |
| `Nova_EA_v1_83_SAFE_READONLY.mq5` | 525342 | 8039 | `21285F68689C29EBA8C88E1FCA6C3307773CD467879E2AF591A4402BAB2A8125` |
| `Nova_EA_v1_83_WORKING.mq5` | 534264 | 8077 | `771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000` |
| `Nova_EA_v1_83_REPAIRED.mq5` | 534264 | 8077 | `771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000` |
| `Nova_EA_v1_83_TEST_DAILY20_MAX10.mq5` | 699004 | 8078 | `2462F7BD08109FBE8694ECC44F493DD42415EDDAB59104B78EFAE98D5AA2212F` |

WORKING and REPAIRED have identical full SHA-256 values and byte counts; they are the same source payload.

A heuristic secret-pattern scan (API-key, secret, password, bearer token, OpenAI-key, JWT-like patterns) reported no matches. This does not guarantee absence of all sensitive data.

## Confirmed observations

1. SAFE_READONLY declares immutable read-only mode and checks it in `TradePermission()`.
2. WORKING has trading-enabled defaults and contains an `OrderSend()` path. It is retained only as unsafe research evidence.
3. Local compile logs previously inspected reported 0 errors and 3 warnings for SAFE_READONLY and WORKING. Compiler build and full warning text still need to be pinned and archived.
4. EX5 binaries are intentionally not committed: source-to-binary mapping has not been proven.
5. The Windows source variants were not found in the GitHub repository search before this archive was created; this branch is the first version-controlled research copy.

## Rules

- Preserve source-variants as immutable evidence.
- Make all changes in a separate candidate directory and on this audit branch.
- Do not install any archived source or binary to a chart.
- Do not enable live trading.
- A passing compile is not evidence of strategy profitability, safe execution, or OOS performance.
