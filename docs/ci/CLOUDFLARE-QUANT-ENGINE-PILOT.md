# Cloudflare Quant Engine CI Pilot

**Status:** implementation branch only; Cloudflare Build connection and execution are not yet verified.  
**Source baseline:** `main` at `a6ee15e96fb83f811db676fcafa85565e3280f04`.  
**Branch:** `pilot/cloudflare-quant-engine-ci-20261120`.

## Scope

Pilot only the checks currently defined in `.github/workflows/quant-engine-foundation-ci.yml`:

1. Compile `workers/quant_engine` and the two focused test modules.
2. Run `python -m unittest discover -s tests -p "test_quant*.py" -v`.
3. Write a machine-readable report to `artifacts/quant-engine-ci-report.json`.

The existing GitHub Actions workflow remains enabled and retains its original compile and unittest reference checks. The pilot adds a second invocation through the new runner and uploads its report so both paths can be compared on the same PR commit.

## Cloudflare Workers Builds configuration

Create a separate Cloudflare Worker project for this pilot. Do not attach the build to a production NOVA Worker.

| Setting | Value |
|---|---|
| Git repository | `vutting895/VOOM_SYSTEM-NOVA-AI` |
| Production branch | `main` |
| Root directory | `ci/quant-engine-worker` |
| Build command | `uv python install 3.11 && uv run --python 3.11 python ../../ci/quant_engine/run.py` |
| Production deploy command | `echo "NOVA Quant CI pilot: production deployment disabled"` |
| Preview command | `npx wrangler@4.156.0 versions upload --config wrangler.jsonc` |
| Preview builds | Enabled |

The build command installs and invokes CPython 3.11 to match the existing GitHub Actions workflow. The Python runner uses only the standard library and runs the same compile and unittest commands as the current workflow.

The Worker entrypoint is a minimal GET-only preview status endpoint. It has no bindings, credentials, broker connectivity, order execution, database access, or external API calls.

## Safety constraints

- Do not disable, remove, or replace `.github/workflows/quant-engine-foundation-ci.yml` during the pilot.
- Keep the original compile and unittest checks as the reference implementation.
- Do not connect this project to any existing production NOVA Worker.
- Do not add Cloudflare secrets, Supabase bindings, broker credentials, or trading capabilities.
- The production deploy command is deliberately a no-op. Verify this setting in the Cloudflare dashboard before connecting the repository.
- Preview deployments are permitted only for the isolated pilot Worker.
- Do not deploy or promote a production version.
- Do not use Affiliate resources, databases, secrets, or Workers.

## Parity acceptance criteria

The pilot is not considered migrated until all criteria pass:

1. Both systems run against the exact same commit SHA.
2. Both execute the same compile and unittest scope.
3. The test outcomes match.
4. Cloudflare logs show the pinned Python 3.11 runtime.
5. The report records the commit SHA and all check outcomes.
6. The pilot completes successfully in three consecutive runs.
7. No production deployment occurs and no existing GitHub Actions workflow is disabled.

Only after these criteria pass may this workflow be proposed for migration. The GitHub Actions workflow remains enabled until a separate approval to retire it.
