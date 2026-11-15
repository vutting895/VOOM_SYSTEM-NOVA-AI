# NOVA Cloudflare Hosted CI

## Goal

Run portable NOVA pull-request validation on Cloudflare Workers Builds instead of GitHub-hosted runners. GitHub remains the source repository and PR review surface. This CI Worker is separate from all NOVA product Workers.

## Dedicated Worker

- Worker name: `nova-ci-runner`
- Source: `integrations/nova-ci/`
- Wrangler config: `integrations/nova-ci/wrangler.jsonc`
- Build entrypoint: `scripts/ci/cloudflare-hosted-ci.sh`
- No product API bindings, Supabase credentials, broker credentials, or deployment permissions are required by the test script.
- The only deployment performed by the Workers Builds deploy command is the isolated `nova-ci-runner` Worker itself.

## Workers Builds settings

Connect the GitHub repository `vutting895/VOOM_SYSTEM-NOVA-AI` to the dedicated `nova-ci-runner` Worker.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/ci/cloudflare-hosted-ci.sh` |
| Deploy command | `npx --yes wrangler@4.156.0 deploy --config integrations/nova-ci/wrangler.jsonc` |
| Preview builds | Enabled |
| Preview command | `npx --yes wrangler@4.156.0 preview --config integrations/nova-ci/wrangler.jsonc` |
| Node version | `24.18.0` |
| Python version | `3.11.9` |
| Skip automatic dependency install | `1` |

The build image supports Node.js and Python on Ubuntu. The script installs the root dependency graph with `npm ci` from the committed root lockfile and invokes Wrangler with `npx --yes wrangler@4.156.0` without modifying the root dependency manifest. Cloudflare documents 3,000 build minutes/month, one concurrent build, and a 20-minute timeout on the Free plan; confirm the account's actual plan and usage before relying on these limits.

## Coverage included

- Root frontend production build.
- NOVA read-only trading guard and security/migration contract tests.
- NOVA AI Worker, System Hub, Remote MCP, MT5 Relay and read-only Proxy Node tests.
- MT5 read-only Bridge Python syntax and unit tests.
- Quant Engine compile and contract tests.
- SMC research unit and pytest suites.
- NOVA CI Inspector Python tests.
- Wrangler dry-runs for the MT5 Relay and System Hub Worker bundles.
- Netlify production route smoke test on pushes to `main`.

## Explicitly not covered by Workers Builds

The current Cloudflare build image is not a Windows runner and does not document a Docker daemon. The following existing acceptance gates are therefore not silently marked as passed:

- Docker Compose validation and Docker image builds.
- Real PostgreSQL migration integration tests.
- Local Supabase Auth/PostgREST stack integration tests that require Docker.
- Windows PowerShell host/runtime checks.

Cloudflare Workers Builds automatically injects `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`. The script requires both and stops before tests if either is missing. It fetches `main` into the explicit `refs/remotes/origin/main` tracking ref, verifies that the injected commit SHA exactly equals the checked-out `git rev-parse HEAD`, and prints the verified SHA before classifying changed files. A mismatch exits as BLOCKED. Do not hardcode or override these build-provided values.

The build script fails closed when a PR changes files that trigger any existing workflow requiring these unsupported gates. The Quant Engine Foundation workflow is Python-only and is included in the portable CI checks; it is not classified as a Docker gate. The guard covers:

- PostgreSQL/Supabase: `supabase/migrations/**`, `supabase/config.toml`, `tests/sql/**`, approval API/server/session integration files, frontend lockfile changes, and the approval/video migration workflow definitions.
- Docker-backed SMC/research: SMC/Elliott Wave/backtest/alerts/risk/runtime source, SMC test suites and fixtures, Python requirements, Dockerfiles at any directory depth, Docker Compose/Compose YAML variants, and the SMC workflow definition.
- Windows Runtime: `tools/windows/**`, `integrations/mt5-readonly-bridge/**`, PowerShell scripts/modules/data files (`.ps1`, `.psm1`, `.psd1`) at any directory depth, `README.md` (which is an explicit trigger for the Windows workflow), and the Windows workflow definition.

The scope matcher has regression cases for nested Dockerfiles, Compose YAML, PowerShell scripts/modules, Supabase migrations, and representative portable paths. The CI script runs these cases before its other checks.

A blocked Cloudflare build is an intentional NOT-VALIDATED result, not a passing substitute for the omitted gate. These suites need a separately approved compatible runner or acceptance process before claiming full NOVA CI coverage. Keep the original GitHub-hosted workflows enabled until each replacement has been proven on the exact PR commit.

## Reproducibility limitation

The root `package.json` contains semver ranges, so the CI requires the committed root `package-lock.json`. The lockfile is now committed and validated with `npm ci` and the full portable CI script on the exact PR commit. The script stops with `BLOCKED` if the lockfile is absent; do not create a placeholder or hand-write lockfile data.

## Migration order

1. Add and review this dedicated CI Worker and portable test script.
2. Connect the repository through Cloudflare Workers Builds and enable PR previews.
3. Verify a PR build on the exact commit SHA and confirm the Cloudflare check appears in GitHub.
4. Only after Cloudflare CI is proven, disable the corresponding GitHub-hosted test jobs.
5. Keep deployment workflows separate. `cloudflare-deploy.yml` and `ai-worker-deploy.yml` are CD workflows, not the portable test runner; do not change their production behavior as part of this CI-only migration.
6. Remove or disable the unused CircleCI project integration separately; the repository currently has no `.circleci/config.yml`.

## Safety

- Never connect this build configuration to `voom-system-nova-ai`, `voom-system-hub`, MT5 Bridge, Remote MCP, or another production Worker.
- Do not add production secrets or broker credentials to the CI Worker.
- Do not deploy NOVA product Workers from this CI Worker.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Do not disable existing GitHub workflows until the Cloudflare check is verified on a real PR.
