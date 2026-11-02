# NOVA Hybrid-Zero Secret Runtime

**Decision:** hybrid-zero (free-first, existing infrastructure only)  
**Status:** repository policy and test guardrails; runtime secret provisioning is NOT verified or activated  
**Baseline:** main at 4480d3bf6fa8f390b09334091f697d8359e79085  
**Scope:** Cloudflare Workers runtime configuration, GitHub Actions deployment boundary, and explicit customer-secret deferral

## 1. Decision

Use the existing Cloudflare Workers as NOVA's server-side runtime and Cloudflare Worker Secrets for system-owned runtime credentials only. Keep GitHub Actions secrets limited to deployment automation. Keep all browser-delivered configuration public and non-sensitive.

This is a zero-new-service design:
- No Fly.io machines, volumes, apps, or secrets.
- No paid Cloudflare Workers plan, Secrets Store, D1, KV, R2, Hyperdrive, or other new paid resource.
- No OpenBao/Vault deployment or paid KMS/HSM.
- No new Supabase project, plan, migration, or billing change.
- No new AI-provider API or paid model.

The design is subject to the existing Cloudflare account remaining within its Free-plan limits and current quota. If the account requires an upgrade, paid add-on, or overage to continue, stop and ask the owner; do not upgrade automatically.

## 2. Secret classes and custody

| Class | Examples / current code contract | Custody | Status |
|---|---|---|---|
| Deployment credentials | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | GitHub Actions repository/environment secrets, consumed only by the trusted main-branch deployment workflow | Existing workflow contract; actual values are never read by this PR |
| Worker runtime route credential | MT5_TENANT_ROUTES used by the MT5 read-only Proxy and Bridge Relay | Cloudflare Worker Secret on each specific Worker; never a Wrangler vars entry, source file, GitHub artifact, or browser variable | Runtime expects this binding; actual Cloudflare configuration is NOT verified |
| Public service configuration | SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, public site keys and service URLs | Existing Worker configuration / frontend public build configuration as appropriate | Publishable/public values only; never substitute a Supabase service-role or secret key |
| Customer provider credentials | Customer-owned exchange/broker API keys, private keys, OAuth refresh tokens | No intake or custody in this phase | BLOCKED; no Cloudflare Worker Secret, GitHub secret, Supabase Vault, chat, MCP, or frontend storage |
| MT5 terminal credentials | Existing Exness Demo terminal session and per-tenant Bridge authentication | Remain within the existing assigned Bridge boundary and its separately controlled route configuration | Do not copy into a general-purpose customer vault or expose through Hub/AI/MCP |

### Important limitation: MT5_TENANT_ROUTES

The current Proxy and Relay code read a JSON route map from env.MT5_TENANT_ROUTES. This is a server-side, system-managed Bridge authentication map, not a customer credential vault. If provisioned, it must be a Cloudflare Worker Secret on both Workers that require it.

The map is a shared Worker trust boundary containing multiple tenant route tokens. It does not provide independent per-customer encryption, per-record authorization, key isolation, lifecycle audit, or independent rotation. The Cloudflare Workers Free-plan environment-variable size limit is 5 KB per variable; the route map must remain below that limit. This approach is not a scale-out customer-custody design. Do not add arbitrary customer provider keys to this map.

The repository does not establish whether this Secret is currently configured in Cloudflare. No secret listing or value retrieval was performed.

## 3. Runtime rules

1. Server-only secrets are read from the Worker's env binding at runtime. A secret value must never be copied into wrangler.jsonc, wrangler.toml, vars, source code, build arguments, frontend VITE_* / NEXT_PUBLIC_* variables, logs, traces, API responses, or test fixtures.
2. Worker configs declare non-sensitive settings only. Never place MT5_TENANT_ROUTES, provider credentials, signing keys, or deployment tokens under vars.
3. GitHub Actions deployment credentials are not application runtime credentials. PR workflows must not receive Cloudflare deployment secrets. The existing deploy workflow is restricted to a successful main-branch Frontend CI run.
4. Public Supabase publishable/anon keys may be used for browser-facing authentication. Never expose service_role, secret API keys, or privileged database credentials.
5. Keep Cache-Control: no-store on authenticated and secret-adjacent API responses. Do not log Authorization headers, cookies, request bodies, tenant route maps, or provider responses containing credentials.
6. Missing or invalid required runtime bindings must fail closed with a sanitized error. Never fall back to a hard-coded token, public variable, arbitrary URL, or permissive default.
7. Keep Exness MT5 Demo read-only. ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false remain mandatory.

## 4. Deployment and rotation boundary

Cloudflare documents that wrangler secret put creates a new Worker version and deploys it immediately. Therefore, this PR does not run wrangler secret put, wrangler secret bulk, wrangler deploy, or any secret-management command. It does not alter Cloudflare account state.

A later owner-approved provisioning operation must:
- Target only the named Worker and approved environment.
- Accept the secret interactively or through a secure secret manager; never put the value in a shell command, chat, PR, file, or log.
- Verify only the binding name and sanitized runtime behavior, never print or fetch the value.
- Have a reviewed rollback and rotation plan.

The current single-token route lookup does not implement overlap/dual-key rotation. Do not claim zero-downtime rotation or automated customer credential rotation. A rotation feature needs its own reviewed code change and tenant-isolation tests.

## 5. Customer-secret custody remains blocked

Cloudflare Worker Secrets are deployment/environment-level bindings, not a multi-tenant customer credential vault. Supabase Vault readiness evidence shows that the existing service_role boundary is too broad for customer-secret retrieval. The Option C separate-custody proposal remains in Draft PR #183 and is not a deployed KMS/HSM-backed custodian.

Until a separately reviewed and funded/approved custody boundary exists:
- Do not accept customer API keys, private keys, refresh tokens, or passwords.
- Do not store customer credentials in Supabase tables, Supabase Vault, D1, KV, R2, GitHub Secrets, Cloudflare Worker Secrets, or Fly.io Secrets.
- Do not expose secret-intake forms, credential-returning APIs, or AI/MCP credential tools.
- Continue using only the existing Exness Demo Bridge path and approved public/read-only market data.
- Report customer credential readiness as disabled/unavailable, not connected.

## 6. Zero-cost acceptance gates

- [ ] Existing Cloudflare account remains on Free plan and within quota; no upgrade or paid add-on.
- [ ] Worker Secrets are used only for system-owned runtime values; no secret is declared in Wrangler vars.
- [ ] MT5_TENANT_ROUTES binding existence is separately verified by an owner-approved sanitized check; this repository PR does not verify it.
- [ ] Deployment secrets remain confined to trusted main-branch GitHub Actions.
- [ ] No customer-secret intake, persistence, decrypt, rotation, or provider operation is enabled.
- [ ] No secret value appears in source, logs, CI output, test fixtures, frontend bundles, or API responses.
- [ ] Exness Demo remains read-only and all execution flags remain false.

## 7. References

- Cloudflare Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- NOVA Vault readiness evidence: docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md
- Option C separate custody proposal: Draft PR #183 (not deployed; requires fresh main alignment and review)
