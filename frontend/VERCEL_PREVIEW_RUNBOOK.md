# Vercel Preview verification runbook

This Next.js app lives in `frontend/`. Vercel Preview deployments are for review only; do not promote a Preview to Production as part of this runbook.

## Build contract

Run from the repository root:

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

GitHub's `Frontend CI` workflow runs these checks and the NOVA AI Worker, Remote MCP, and read-only MT5 Bridge safety tests.

## Deployment verification

1. In the GitHub pull request, confirm the Vercel check refers to the exact PR head commit.
2. In Vercel, confirm the deployment is a Preview and its Git source is branch `integration/consolidate-voom-system` (or the relevant PR branch).
3. Wait for `Ready`; a deployment marked `Canceled` is not a successful Preview, even when GitHub CI passed.
4. Open the Preview URL and verify the dashboard loads. Confirm authentication-protected account and broker API requests reject unauthenticated requests (HTTP 401).
5. Do not copy production data or secrets into Preview logs. Never send real trade orders during smoke tests.

## Access and cancellation failures

If Vercel's API rejects a Preview deployment with a permission error, use the Git-connected pull request workflow or check that the authenticated Vercel user has permission to deploy previews for project `voom_system_nova`. Do not change the Production branch or deploy production as a workaround.

Preview deployments are protected by Vercel SSO in the current project settings. A canceled Preview requires a new Git deployment; do not treat a canceled state as a build failure or as proof of code correctness.

## Safety defaults

- MT5 integration remains read-only.
- Keep paper/test mode and all live-trading flags disabled.
- Do not promote the PR or delete the source repository until preview verification and the PR review are complete.
