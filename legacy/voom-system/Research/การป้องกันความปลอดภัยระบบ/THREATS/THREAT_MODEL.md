# VOOM Threat Model — Initial Baseline

**Status:** research; validate against the actual deployed architecture before treating any item as confirmed.

## Assets to protect
- Source code, repository permissions, build/deploy tokens and CI configuration.
- Cloudflare Worker endpoints, API secrets, request authentication and rate limits.
- Vercel dashboard, environment variables, deployment permissions and preview environments.
- Supabase database, service-role credentials, row-level security policies and backups.
- Local MCP knowledge, learning database, semantic index, exported skills and user-provided research.
- MT5 terminal/EA bridge, broker credentials, trade commands, risk limits and audit logs.
- Operator identity, recovery mechanisms, incident evidence and service availability.

## Trust boundaries
- Browser/dashboard to backend API.
- Cloudflare Worker to upstream AI provider and MT5 client.
- Vercel build pipeline to production deployment.
- Application service to Supabase.
- Local AI client to MCP stdio server and local files.
- External web/repository content to AI retrieval and learning pipeline.
- Human approval channel to automated remediation executor.

## Threat scenarios to test
1. Missing/weak authentication, authorization gaps or leaked service tokens.
2. Prompt injection inside retrieved documents or research pages leading to unsafe tool calls.
3. Secrets committed to Git, exposed in logs, browser bundles or error responses.
4. Supabase policies or backend checks that permit unauthorized reads/writes.
5. Worker abuse: request replay, unbounded cost, missing rate limits, permissive CORS misunderstood as auth.
6. Supply-chain compromise, unpinned dependencies, compromised CI or unreviewed deployment.
7. Unsafe automatic learning that publishes malicious, incorrect or secret-bearing content.
8. MT5 bridge misuse, duplicate orders, stale signals or bypass of risk guardrails.
9. Destructive remediation, lost audit evidence or denial of service.
10. Backup/recovery gaps and insufficient incident visibility.

## Safe validation
Use owned development/staging environments, synthetic data and non-production credentials. Record asset, test scope, date, evidence, result and cleanup. No exploitation of third-party systems, persistence, credential theft, destructive payloads or live trading tests without a separately approved engagement.
