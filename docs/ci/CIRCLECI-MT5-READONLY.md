# CircleCI — NOVA Read-only Validation

## Purpose

This pipeline provides an independent CI path for NOVA after GitHub-hosted runner
allocation failures. It validates source code and read-only safety contracts only.

## Scope

- Node.js tests for trading safety, authentication, tenant isolation and MT5 relay/proxy.
- Python syntax and static tenant-guard tests. These tests do not connect to MT5.
- Wrangler dry-run validation. No Worker is deployed.
- Vite production build. No Netlify deployment is triggered.

## Explicit exclusions

- No CircleCI deployment job.
- No Cloudflare, Supabase, Netlify, broker or MT5 credentials in CircleCI.
- No Supabase migrations or writes.
- No MT5 order, position modification, withdrawal or transfer APIs.
- No live trading enablement.

All external service values used by the frontend build are non-secret placeholders.

## Enablement

1. Connect `vutting895/VOOM_SYSTEM-NOVA-AI` to CircleCI using the CircleCI GitHub App or supported VCS integration.
2. Keep the project on the Free plan initially; monitor monthly credits and build duration.
3. CircleCI detects `.circleci/config.yml` on the branch and runs the validation workflow.
4. Require the CircleCI status check on pull requests only after at least one successful baseline run.
5. Keep GitHub Actions as a fallback until CircleCI has passed the same test suite on multiple PRs.

## Runner failure handling

Do not repeatedly rerun a job that failed before executor allocation. Capture the pipeline/job URL,
executor allocation state and first failing step. A failure before the first step is an executor or
integration issue, not evidence of a source-code test failure.

## MT5 runtime validation boundary

This pipeline does not prove that a Windows MT5 terminal is logged into Exness Demo or that a
tenant route/token is provisioned. Those checks must run on the dedicated Windows machine with
the MT5 terminal already open, using the separate read-only bridge runbook.

The EA file `integrations/mt5/MTRADERS_All_In_One_v1.01.mq5` is not changed by this CI setup.
Its current NOVA read-only guard returns immediately from `OnTick()`; the EA must not be
represented as an active telemetry source until a separate, reviewed read-only telemetry
implementation is compiled and verified in MetaEditor.

## Safety invariants

```text
Live Trading: OFF
Broker Writes: OFF
Order Submission: DISABLED
Withdrawals / Transfers: DISABLED
CI Deployments: DISABLED
```
