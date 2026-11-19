# NOVA No-CI/CD Manual Release Policy

Status: Proposed on feature branch; not active on `main` until reviewed and merged.
Policy: No CI/CD. Zero-cost strict. No billing linkage or paid services.

## Scope

This change removes the seven automated test/validation workflows and two automatic Cloudflare deployment workflows from the repository workflow directory. It does not disable unrelated data operations:

- `kaggle-daily-ingestion.yml` remains a separately governed data-ingestion automation, not a build/test/deploy pipeline.
- `kaggle-api-readonly-check.yml` remains a manually invoked, read-only credential/API diagnostic. Do not use it as a CI gate.
- No GCP Build, Billing, GitHub Actions CI, hosted test runner, Cloudflare Hosted Builds, or automatic production deployment is authorized by this policy.

## Required release evidence

Every release candidate must record:

1. Repository and exact commit SHA tested.
2. Clean working tree and reviewed diff.
3. Node.js, npm, Python and (when applicable) PowerShell versions.
4. Exact commands executed and complete exit codes.
5. Unit, integration, migration and security test results, including tests not run and why.
6. Build output and dependency-audit result.
7. Target environment, deployment operator, deployment time and deployment result.
8. Post-deploy health/safety checks and rollback reference.

A skipped test is NOT PASS. A local frontend build does not prove Supabase migration, Docker, Cloudflare Worker, MT5 Bridge or production health.

## Local verification on Windows

Run from the repository root in PowerShell:

```powershell
git status --short
git rev-parse HEAD
node --version
npm --version
python --version
.`tools\windows\verify-local-release.ps1`
```

The script runs the portable frontend, Node, Python, Quant, SMC and CI Inspector checks that are available in the checkout. It is not a substitute for Docker-backed PostgreSQL/Supabase integration tests or a live production smoke test. Any failed command blocks release. Capture the full terminal output and tested SHA.

Known issue at the time this policy was drafted: the repository's dependency audit documented a High-severity transitive Firebase/gRPC advisory. Do not suppress it, force a semver-major downgrade, add an unreviewed override, or claim the security gate passed. A release touching the affected dependency chain remains blocked until a compatibility-tested remediation is documented.

## Manual deployment boundaries

### Netlify frontend

1. Verify the exact approved commit and complete local release evidence.
2. Run `npm run build`; confirm the `dist/` output exists.
3. Upload the built `dist/` directory using the Netlify site's manual deploy interface.
4. Record the resulting deploy ID/URL and verify the production routes.
5. If verification fails, use the Netlify deploy history to restore the last known-good deploy.

Netlify is the primary frontend host. Do not connect a new paid plan or billing account.

### Cloudflare Workers

Deploy only the Worker(s) changed by the approved release, from the exact approved commit. Authenticate with the existing authorized Wrangler session; never print or commit credentials. Confirm required non-secret vars and existing secrets are configured before deployment.

Commands (run from repository root; use only the relevant changed Worker):

```powershell
npx wrangler deploy --config integrations/mt5-bridge-relay/wrangler.jsonc
npx wrangler deploy --config integrations/mt5-readonly-proxy/wrangler.jsonc
npx wrangler deploy --config integrations/remote-mcp-worker/wrangler.jsonc
npx wrangler deploy --config integrations/system-hub/wrangler.jsonc
npx wrangler deploy --config integrations/nova-ai-worker/wrangler.toml
```

Do not deploy every Worker by default. Do not deploy the Cloudflare-hosted frontend as a substitute for Netlify. Do not run migrations or alter bindings/secrets without a separate approved change and rollback plan.

After each Worker deployment, verify its health endpoint, authentication boundary, tenant isolation and read-only trading safety contract. Keep `ordersEnabled=false`, `executionEnabled=false` and `liveTradingEnabled=false`.

## Database and trading safety

- Supabase migrations require a separate migration plan, local/integration validation, backup/restore plan and explicit approval before production application.
- No automatic schema migration is permitted.
- No MT5 order execution, live trading, transfers or withdrawals are authorized.
- A failed or incomplete production verification means release status is BLOCKED; use the last known-good deployment/migration rollback procedure.

## Rollback

Before deployment, identify the previous known-good Netlify deploy and Worker versions/commit. If post-deploy checks fail:

1. Stop further deployments and data migrations.
2. Restore the prior Netlify deploy and/or redeploy the prior Worker version/source.
3. Verify health and safety flags.
4. Record the incident, affected SHA, rollback SHA/version and evidence.
5. Do not resume release until the cause is understood.

## Explicit prohibitions

- No CI/CD workflows or hosted build/test runners.
- No GCP Billing linkage or paid API/service activation.
- No automatic production deployment on push, PR or workflow completion.
- No merge/deploy based solely on an unverified green badge.
- No claim of completion without exact-SHA evidence.

## Activation

This policy becomes active only after this feature branch is reviewed and merged by the repository owner. Until then, current `main` workflows remain unchanged. This feature branch itself must not trigger any product deployment.
