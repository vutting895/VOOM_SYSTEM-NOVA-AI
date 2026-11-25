# NOVA GitHub Event Receiver (read-only)

This is an isolated Cloudflare Worker candidate for verified GitHub webhook intake. It is not connected to GitHub, Notion, or Slack yet and must not be deployed until the configuration and test gates below are met.

## Contract

- Accepts `POST /github` and `GET /health`.
- Verifies GitHub's `X-Hub-Signature-256` HMAC against the raw request body using `GITHUB_WEBHOOK_SECRET`.
- Requires a valid `X-GitHub-Delivery` UUID and permits only `push`, `pull_request`, `issues`, and `workflow_run`.
- Enforces an explicit `ALLOWED_REPOSITORIES` allowlist. NOVA and VOOM Studio Affiliate must be added as separate, explicit repository names.
- Persists only a sanitized event envelope in D1. Raw webhook payloads, issue text, commit messages, credentials, and signatures are not stored or logged.
- Uses D1 `INSERT OR IGNORE` with a unique delivery ID for atomic idempotency.
- Does not call Notion, Slack, GitHub APIs, broker APIs, or any trading endpoint. No external side effects.

## Local validation

Requires Node.js 22+.

```bash
node --test
```

## Required runtime configuration (not yet provisioned)

- `GITHUB_WEBHOOK_SECRET`: store as a Worker secret, never in Git, Notion, Slack, or logs.
- `ALLOWED_REPOSITORIES`: comma-separated exact `owner/repo` allowlist.
- `EVENT_DB`: Cloudflare D1 binding using `migrations/0001_github_deliveries.sql`.

Create and migrate the D1 database only after confirming the target Cloudflare account/project and recording a rollback plan. No database has been created or migrated by this change.

## GitHub webhook setup (not performed)

After deployment and a successful authenticated test, configure a repository webhook with:
- Content type: `application/json`
- Secret: same value as the Worker secret, provisioned securely
- Events: Push, Pull requests, Issues, Workflow runs
- Active: only after signature, idempotency, persistence, and replay tests pass

Webhook administration is not exposed by the currently connected GitHub tool set. No webhook was created.

## Safety gates

- Receiver remains read-only and inbox-only.
- Do not add automatic Notion task creation or Slack notifications in this phase.
- Failed/unknown CI states must never be represented as passed.
- Do not enable billing, paid plans, production deployment, broker mutation, order execution, or live trading.