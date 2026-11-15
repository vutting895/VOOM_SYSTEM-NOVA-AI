# NOVA Cloudflare Hosted CI

## Goal

Run the portable NOVA validation suite on Cloudflare Workers Builds while keeping GitHub as the source repository and PR review surface. This CI integration is separate from all NOVA product Workers.

## Dedicated Worker boundary

- Worker name: `nova-ci-runner`
- Source: `integrations/nova-ci/`
- Wrangler config: `integrations/nova-ci/wrangler.jsonc`
- Build entrypoint: `scripts/ci/cloudflare-hosted-ci.sh`
- The validation script does not require product API bindings, Supabase credentials, broker credentials, or deployment permissions.
- The CI build must not deploy NOVA product Workers or modify Netlify, Supabase, MT5, or trading runtime configuration.

## Workers Builds settings — validation-only pilot

Connect only the repository `vutting895/VOOM_SYSTEM-NOVA-AI` to the dedicated `nova-ci-runner` Worker after separate account-level authorization.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/ci/cloudflare-hosted-ci.sh` |
| Preview builds | Disabled during the validation-only pilot |
| Preview command | Not configured |
| Deploy command | `npx --yes wrangler@4.156.0 deploy --dry-run --config integrations/nova-ci/wrangler.jsonc` |
| Node version | `24.18.0` |
| Python version | `3.11.9` |
| Skip automatic dependency install | `1` |

**Build** runs the tests and checks. **Preview** is disabled; no preview Worker is published. **Deploy** is a Wrangler dry-run only; it does not publish even the isolated CI Worker. A real preview or deployment requires separate explicit authorization and a reviewed account configuration.

Cloudflare documents Free-plan limits of 3,000 build minutes/month, one concurrent build, and a 20-minute build timeout. The account's actual plan and remaining usage have not been verified. Measure the first authorized pilot run before relying on these limits or changing any existing runner.

## Dependency installation and security

- The root lockfile contains six package entries marked as having install scripts: `@firebase/util`, `@google/genai`, `esbuild` (two versions), `fsevents`, and `protobufjs`.
- These lifecycle scripts have not been individually reviewed and therefore none is allowlisted.
- CI uses `npm ci --include=dev --ignore-scripts` to prevent unreviewed lifecycle scripts from executing. If the build or tests require one of these scripts, the job must fail and the package must be reviewed individually before any narrowly scoped exception is added.
- CI runs `npm audit --audit-level=high` and fails closed on high-severity advisories. It does not run `npm audit fix`, downgrade Firebase, or modify the lockfile.
- The current PR evidence reports four high-severity advisories involving Firebase/Firestore and transitive `@grpc/grpc-js`. Until those are remediated in a separately reviewed dependency change, the audit gate is expected to fail. Do not weaken or bypass the gate to make the build green.

## Coverage included

- Root frontend production build and TypeScript check (`npm run build`, `npm run lint`).
- NOVA read-only trading guard and security/migration contract tests.
- NOVA AI Worker, System Hub, Remote MCP, MT5 Relay and read-only Proxy Node tests.
- MT5 read-only Bridge Python syntax and unit tests.
- Quant Engine compile and contract tests.
- SMC research unit and pytest suites when the change scope is portable.
- NOVA CI Inspector Python tests.
- Wrangler dry-runs for the MT5 Relay and System Hub Worker bundles.
- Netlify production route smoke test on pushes to `main` only; this is an HTTP smoke test, not a deployment command.

## Explicitly unsupported gates

Workers Builds is a Linux build environment and does not document a Docker daemon. It is not a Windows runner. The following gates remain outside this portable job:

- Docker Compose validation and Docker image builds.
- Real PostgreSQL migration integration tests.
- Local Supabase Auth/PostgREST stack integration tests that require Docker.
- Windows PowerShell host/runtime checks.

The scope guard fails closed when a changed file triggers one of these unsupported workflows. In particular, the root `package-lock.json` is included in the SMC Research workflow path filters, and that workflow runs Docker Compose validation plus Docker image builds. Therefore, root `package-lock.json` changes are classified as unsupported for this portable Cloudflare job. Regression tests cover this path along with nested Dockerfiles, Compose YAML, PowerShell files, and Supabase migrations.

A blocked Cloudflare build is a NOT-VALIDATED result, not a passing substitute for an omitted gate. Keep the existing GitHub-hosted workflows enabled until Cloudflare has been proven on the exact PR SHA and all unsupported gates have separate coverage.

## Exact-commit verification

Cloudflare Workers Builds injects `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`. The script requires both, verifies that the injected SHA exactly matches `git rev-parse HEAD`, prints the verified SHA, fetches `main` into an explicit remote-tracking ref, and classifies changed files before running tests. A mismatch exits as BLOCKED.

The root `package.json` uses semver ranges, so the committed root `package-lock.json` is required. The script blocks if that lockfile is absent; do not create a placeholder or hand-write lockfile data.

## Migration order

1. Review and validate this isolated CI implementation on the PR branch.
2. Separately authorize and configure the GitHub repository connection and Workers Builds settings for `nova-ci-runner`.
3. Run a controlled pilot and verify the exact commit SHA, build steps, logs, duration, and GitHub check result.
4. Only after Cloudflare CI is proven, separately review whether corresponding GitHub-hosted jobs can be disabled.
5. Keep `cloudflare-deploy.yml` and `ai-worker-deploy.yml` unchanged; they are CD workflows, not the portable test runner.
6. Handle any unused CircleCI integration separately; this PR does not change it.

## Safety

- Never connect this build configuration to `voom-system-nova-ai`, `voom-system-hub`, MT5 Bridge, Remote MCP, or another production Worker.
- Do not add production secrets or broker credentials to the CI Worker.
- Do not publish the CI Worker or product Workers as part of this validation-only PR.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Do not disable existing GitHub workflows until a real Cloudflare check is verified on an exact PR commit.
