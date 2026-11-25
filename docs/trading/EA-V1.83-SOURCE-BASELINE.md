# NOVA EA v1.83 — Source Baseline

**Status:** Audit baseline only — no trading code changed  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Baseline branch:** `main`  
**Baseline commit:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Audit branch:** `audit/ea-v183-phase1-2-20261125`

## Scope and provenance

The v1.83 source variants were inspected on the connected Windows MT5 terminal under:

`MQL5/Experts/nova v.1.83/`

Observed files:

| File | Observed lines | Observed bytes | SHA-256 prefix |
|---|---:|---:|---|
| `Nova_EA_v1_83.mq5` | 8,054 | — | `4D8838B6` |
| `Nova_EA_v1_83_SAFE_READONLY.mq5` | 8,039 | 525,342 | `21285F68` |
| `Nova_EA_v1_83_WORKING.mq5` | 8,077 | — | `771B05C1` |
| `Nova_EA_v1_83_REPAIRED.mq5` | 8,077 | — | `771B05C1` |
| `Nova_EA_v1_83_TEST_DAILY20_MAX10.mq5` | 8,078 | — | `2462F7BD` |

The SHA values above are abbreviated prefixes from the Windows audit record, not complete hashes. Capture full SHA-256 values and preserve the original files before any source import or patching.

## Confirmed observations

1. `WORKING` and `REPAIRED` were reported to have identical SHA-256 values and line counts; treat them as the same source payload until a fresh full-hash check confirms otherwise.
2. `SAFE_READONLY` defines a hard read-only constant and checks it through `TradePermission()`.
3. `WORKING` has trading-enabled defaults and a path to `OrderSend()`; do not install or attach it to a live account.
4. Local compile logs previously inspected reported 0 errors and 3 warnings for SAFE_READONLY and WORKING. These are compile observations only, not strategy, execution, or safety acceptance.
5. The Windows source has not yet been proven byte-identical to any file on GitHub. No EA source file was located in the repository search performed during this audit.

## Evidence limitations

- The full source files are not committed to this repository by this baseline change.
- Full SHA-256 values, exact file timestamps, compiler build, full warning text, and source-to-binary mapping must be recaptured before source import.
- A local filename or compile log is not proof that the matching EX5 is the binary attached to a chart.
- The current branch is documentation-only; no EA installation, live trading, order placement, or production configuration change is authorized by this change.

## Handling rules

- Preserve all original variants as immutable evidence.
- Import only into a dedicated research/source archive after full hashes are captured.
- Never overwrite the installed MT5 EA during Phase 1–2.
- All code changes must be made on this audit branch or a child branch and reviewed through a draft PR.
- Keep live execution disabled until independent negative tests and the NOVA production gate pass.
