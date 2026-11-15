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

The build image supports Node.js and Python on Ubuntu. The script installs dependencies explicitly and pins Wrangler to 4.156.0. Cloudflare documents 3,000 build minutes/month, one concurrent build, and a 20-minute timeout on the Free plan; confirm the account's actual plan and usage before relying on these limits.

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

The build script requires `WORKERS_CI_COMMIT_SHA` whenever `WORKERS_CI_BRANCH` is set, verifies that it exactly equals the checked-out `git rev-parse HEAD`, and prints the verified SHA before classifying changed files. A mismatch or missing SHA exits as BLOCKED before tests run. Configure these variables from the build's actual branch and commit metadata; never set them to a stale or manually guessed value.

The build script fails closed when a PR changes files that trigger any existing workflow requiring these unsupported gates. The guard covers:

- PostgreSQL/Supabase: `supabase/migrations/**`, `supabase/config.toml`, `tests/sql/**`, approval API/server/session integration files, frontend lockfile changes, and the approval/video migration workflow definitions.
- Docker-backed Quant/SMC: Quant Engine source and contract tests, SMC/Elliott Wave/backtest/alerts/risk/runtime source, SMC test suites and fixtures, Python requirements, Dockerfiles at any directory depth, Docker Compose/Compose YAML variants, and the corresponding workflow definitions.
- Windows Runtime: `tools/windows/**`, `integrations/mt5-readonly-bridge/**`, PowerShell scripts/modules/data files (`.ps1`, `.psm1`, `.psd1`) at any directory depth, `README.md` (which is an explicit trigger for the Windows workflow), and the Windows workflow definition.

A blocked Cloudflare build is an intentional NOT-VALIDATED result, not a passing substitute for the omitted gate. These suites need a separately approved compatible runner or acceptance process before claiming full NOVA CI coverage. Keep the original GitHub-hosted workflows enabled until each replacement has been proven on the exact PR commit.

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
