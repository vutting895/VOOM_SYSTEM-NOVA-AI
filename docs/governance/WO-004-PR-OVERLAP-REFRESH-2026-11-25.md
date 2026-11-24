# WO-004 — Latest PR overlap refresh (2026-11-25)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Latest PR base SHA observed on #391–#394: `07afb3f3ed1948788bb9961682715518823aff4c` (not a blanket assertion for all open PRs).
- Scope: PR overlap review only. No source-code restructuring is authorized by this report.

## Findings

| PR | State | Changed paths | Disposition |
|---|---|---|---|
| #394 | Open, Draft | `integrations/remote-mcp-worker/src/index.js`, `tests/test_research_pipeline.py`, `workers/runtime.py` | Keep for integrated MCP syntax + RiskWorker gate correction. Exact head `08cc8207528012cf0322cb0982d166af4d44894a`; CircleCI error (1817); Vercel context success is not production evidence. No exact-head Actions/test pass verified in this review. |
| #393 | Closed, unmerged | `tests/test_research_pipeline.py`, `workers/runtime.py` | Explicitly superseded by #394; history only. |
| #392 | Open, Draft | `infra/README.md`, `infra/docker-compose.yml` | Compose archive profile + corrected docs. Exact head `079c11e42c4275525de29c334ec42ff62c2e3419`; CircleCI error (1810); Vercel context success. Docker Compose CLI and startup smoke tests outstanding. |
| #391 | Open, Draft | `.github/workflows/nova-compose-architecture-ci.yml`, `infra/docker-compose.yml` | Same Compose service change as #392, plus CI workflow. Exact head `b3e646b21362ec00164709bf44702bfefb410c9f`; CircleCI error (1806); Vercel context success. Docker runtime tests outstanding. |
| #390 | Closed, unmerged | `infra/docker-compose.yml` | Older Compose candidate; history only. |
| #389 | Open, Draft | `docs/architecture/NOVA-MULTI-REPO-COMMAND-CENTER-INTEGRATION-PLAN.md`, `docs/openapi/nova-system-hub-v1.yaml` | Docs-only architecture/API contract. Based on older main SHA; not implementation/deployment proof. |
| #388 | Closed, unmerged | Same two docs as #389 | Superseded by #389; history only. |

## Critical overlap analysis

#391 and #392 are overlapping but not equivalent. Both modify the same Compose service definition to put the legacy Python MCP prototype behind the opt-in `legacy-archive` profile and set `restart: "no"`. #391 adds a Compose CI workflow; #392 fixes README statements about the default stack. Neither branch alone contains the full complementary set. Do not close one as a duplicate without a reconciled integrated PR and exact-head validation.

The current-main Compose file (blob `1a52b30d87cc6614f3115b0875a65f911b83cd89`) still defines `mcp-server` as a default service. The proposed workflow `.github/workflows/nova-compose-architecture-ci.yml` is absent from main (file read returned 404). This is an outstanding local-Compose architecture issue, not evidence of a production duplicate MCP gateway. No runtime Docker test was performed here.

#394's patch is internally consistent with the stated fail-closed intent: deterministic risk rejection precedes approval-service availability; missing bearer auth on a risk-passing request returns 401; authenticated requests still return 503 when approvals are disabled. However, source-diff inspection is not test evidence. Keep Draft until exact-head Node/Python tests and all required builds pass.

## Safety and phase status

- No PR merged/closed, branch deleted, workflow edited, source/data/model/migration moved, deployment triggered, database changed, secret/permission changed, or broker action performed.
- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false` remain required invariants; no activation claim made.
- Phase 1: IN PROGRESS. Phase 2: IN PROGRESS. Phase 3: PRELIMINARY / BLOCKED (zero moves approved). Phases 4–6: NOT STARTED.

## Next actions

1. Reconcile #391/#392 into one proposed change set, retaining both the README correction and CI validation only after CI scope is separately authorized.
2. Run Docker Compose config and default/explicit archive-profile startup smoke tests on the exact integrated head.
3. Obtain exact-head GitHub Actions/CI evidence for #394 and review all required Python/Node/container checks.
4. Continue the remaining open-PR changed-path inventory and exact caller/workflow/deployment mapping before proposing any file move.

Operations log: [logs/OPERATIONS.md](../../logs/OPERATIONS.md)
NOVA Master Tracker: [Issue #36](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/36)


## Exact-head GitHub Actions addendum — PR #394

- GitHub Actions run `45447170407` (SMC Research CI, run #590) is attached to exact PR #394 head `08cc8207528012cf0322cb0982d166af4d44894a`.
- Run conclusion: **SUCCESS**. One job (`smc-tests`) completed successfully. Verified steps include Python dependency setup, SMC module compile, focused SMC tests, pytest regression suite, Cloudflare Worker SMC classification tests, Docker Compose configuration validation, research-worker container build, and frontend container build.
- This is meaningful exact-head evidence and updates the earlier statement that no exact-head Actions result was verified. It does **not** prove a separate full Remote MCP Node test suite was run: no step is explicitly named as the complete MCP Worker Node test suite. CircleCI status remains error (pipeline 1817), and Vercel context success remains non-production evidence.


## Additional stale-branch review — PRs #290–#294

- Current main HEAD observed by commit comparison: `1230ca736522e612dc79cd86d3613cd0960b8c52`.
- #292 (open Draft, 6 files) is a read-only multi-timeframe SMC research analyzer. It adds `workers/feature/smc_wave/multi_timeframe.py`, changes `workers/runtime.py` and `.github/workflows/smc-research-ci.yml`, and adds API/unit tests. It explicitly keeps the route research-only, has no end-user authentication, and must remain inside the internal Docker network. Compare current `main` → PR head: **diverged, 11 ahead / 219 behind**, merge base `97b956f3929011192e92d82e5e7f97249bf303a0`. Historical PR body reports prior CI failures before runner assignment; those are not current exact-head pass evidence. **Disposition: KEEP FOR REBASE/REVIEW; do not merge as-is.** It also overlaps `workers/runtime.py` with newer PR #394, so rebase and retest against current main are mandatory.
- #291 (open Draft, 2 files) adds a bounded read-only Exness MT5 Demo M1–D1 exporter and tests. It requires confirmed Exness Demo/server/symbol/BID mode, exports native tick_volume and UTC bar-open timestamps, writes SHA-256 manifests and marks outputs training-ineligible pending independent audit. It does not contact an MT5 terminal in the reported tests and does not recover the #238 missing dataset. Compare current `main` → PR head: **diverged, 7 ahead / 221 behind**, merge base `dad49ccbd6e69a02c6bb5c248657d6e12a421fe3`. PR body reports 7/7 Windows unit tests but historical CI is inconclusive/blocked and no real export occurred. **Disposition: KEEP AS A UNIQUE DATA-RECOVERY TOOL CANDIDATE; do not merge as-is or claim dataset recovery.** Rebase and exact-head tests required.
- #294 and #290 are closed/unmerged aggregate-profit-close feature candidates. #293 is merged but is explicitly titled a revert restoring main before the aggregate-profit-close feature; its changed paths are the migration and tests. Therefore these PRs do not establish that aggregate-profit-close is currently active on main. Do not treat the old candidate as implemented or reopen it without a fresh requirement and full schema/risk review.
- These five PR metadata/path lists and two full patch sets were reviewed in this pass. No PR state or branch changed, no code was merged, no exporter was run, and no data/model/DB/broker action occurred.
