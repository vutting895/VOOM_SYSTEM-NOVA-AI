# NOVA Marketing & Sales Engine — W0 Schema, API and Migration Readiness Audit

**Audit date:** 2026-10-31  
**Status:** W0 evidence captured; migration execution is blocked pending migration-ledger reconciliation and review  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Exact inspected main SHA:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Architecture parent/reference:** Draft PR #129 — `docs/architecture/NOVA-MARKETING-SALES-ENGINE.md`  
**Master tracker:** Issue #36 and existing automation `6ae3f12712a88191b2eab90a138d7270`  
**Permanent approval dependency:** PR #67, merged as `5de80ad4324e93843f6b1aaa3af9004230c81e05`

## 1. Executive finding

The repository and both connected Supabase projects were inspected read-only. The Marketing & Sales Engine does **not** have an existing CRM, package catalog, tenant membership model, campaign, order, payment, consent or marketing API implementation to extend. The correct next design is additive, but it is **not safe to apply a new migration yet** because the Production and Staging migration ledgers do not match one another or the current repository migration filenames.

The most important blockers are:

1. Production has 24 migration-history entries and 19 public tables, but no `nova_agent_threads` / `nova_approval_requests` tables from merged PR #67.
2. Staging has only two migration-history entries and eight public tables. It contains the PR #67 approval schema, but it does not contain the Production baseline.
3. The same migration names appear under different version numbers across repository, Production and Staging. The four SQL migration files currently on `main` are not a complete reproducible source baseline for Production's 24 migration entries.
4. PR #67 is a **single-user / owner-scoped strategy-draft review lifecycle**, not a multi-tenant marketing approval system. Its request type, policy version, validator, trigger and RPC logic are deliberately constrained to `strategy_draft_review`.
5. Staging contains five RLS-enabled tables with no policies while `anon` and `authenticated` retain broad table grants. One of these tables, `user_brokers`, contains legacy API-key/encrypted-secret columns. RLS currently denies row access in the absence of policies, but this is a separate security issue and those tables must not be reused for marketing data.

**W0 disposition: BLOCKED for hosted migration execution; READY for design review.** No database schema, migration history, grant, policy, secret, provider setting, deployment or customer record was changed.

## 2. Repository baseline and inventory

### 2.1 Canonical source

| Item | Observed value |
|---|---|
| Repository | `vutting895/VOOM_SYSTEM-NOVA-AI` |
| Default branch | `main` |
| Current main SHA | `a2acfd8ec9b598e6593413549bef760e8f596a72` |
| Recursive Git tree | 184 paths; not truncated |
| Migration files on main | 4 |
| Next.js API route handlers | 7 |
| Existing test files | Node built-in test runner, SQL integration and local Supabase harnesses |
| Frontend | Existing Next.js application; Netlify remains primary frontend host |
| Backend | Existing Cloudflare Workers / NOVA AI Worker / System Integration Hub |
| Database | Supabase Free; no paid branch or project created |

The repository tree was fetched recursively at the exact main SHA. The migration and route inventories below are from that tree, not from branch-only proposals.

### 2.2 Current migration files on main

Only these four files exist under `supabase/migrations/` on the inspected main:

| File | Purpose |
|---|---|
| `202610240001_alpaca_oauth.sql` | Historical Alpaca OAuth state and encrypted-token tables |
| `202610270001_mt5_customer_connections.sql` | Customer-owned Exness MT5 Demo pending connection requests |
| `202610290001_security_definer_marketplace_hardening.sql` | Moves privileged marketplace implementations into non-exposed `private` schema and keeps public invoker wrappers |
| `202610300001_nova_durable_approval_lifecycle.sql` | Durable owner-scoped strategy-draft approval lifecycle |

Do not delete or rewrite historical Alpaca migrations as part of this task. The retired integration is not a candidate for reuse by Marketing & Sales.

### 2.3 Current Next.js API route inventory

Exactly seven route handlers were present under `frontend/app/api/`:

| Route | Existing behavior |
|---|---|
| `/api/agent/threads` | GET/POST owner-scoped NOVA review threads |
| `/api/agent/threads/:threadId/approvals` | GET/POST strategy-draft approvals for an owner thread |
| `/api/agent/approvals/:approvalId/decision` | POST approve/reject/edit decision |
| `/api/backtest` | Backtest API |
| `/api/broker/status` | Existing broker status / request path |
| `/api/chat` | Existing AI chat API |
| `/api/gen-ai/generate` | Existing strategy-draft generation API |

No marketing, CRM, catalog, package, campaign, offer, checkout, payment webhook, subscription-billing or advertising route exists on this main SHA.

### 2.4 Existing API security pattern

The current approval routes reuse `frontend/lib/agent-approval-server.js`:

- Requires a Bearer access token and verifies it using Supabase `auth.getUser(accessToken)`.
- Derives the user ID from the verified Auth response; it does not trust a caller-supplied owner ID.
- Uses the public/anon client key with the caller's access token; the route source does not embed a service-role key.
- Returns `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Validates JSON content type, object shape and request byte limits before processing.
- Approval routes are guarded by server-side `NOVA_APPROVALS_ENABLED === "true"`; they fail closed when the flag is unset.
- Thread/approval list reads filter by `auth.user.id`; approval mutations use the database RPCs.

Existing route request caps are 4,000 bytes for thread creation and 8,000 bytes for approval create/decision. These are existing contracts, not a recommendation to reuse the same limit blindly for future campaign assets.

The existing API helper does not establish an organization/tenant membership context, role matrix, marketing idempotency key, channel consent check, campaign budget authority or provider action ledger. Those controls must be designed before new routes are implemented.

## 3. Live Supabase evidence — read-only inspection

The connected projects were inspected using project metadata, public table/column/foreign-key inventory, migration history, `pg_policies`, `information_schema.role_table_grants`, routine metadata, trigger metadata and Supabase Security/Performance Advisors. No data values, credentials or secret contents were queried.

### 3.1 Project state

| Property | Production | Staging |
|---|---|---|
| Project name | `Voom_system` | `vutting895's Project` |
| Project ref | `tlyyxufuiimrbaksoitf` | `rovhmjeowracayicbqij` |
| Region | `ap-southeast-1` | `ap-northeast-1` |
| Status | `ACTIVE_HEALTHY` | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.11.0.003 | 17.11.0.002 |
| Public tables | 19 | 8 |
| RLS enabled | 19/19 | 8/8 |
| Migration ledger entries | 24 | 2 |

`ACTIVE_HEALTHY` is a service-health label; it does not mean the schemas or migration ledgers are equivalent.

### 3.2 Migration-ledger drift — release blocker

**Production** currently records 24 migrations. Its last listed migration is `20261029084244 security_definer_marketplace_hardening`. It has the Exness connection table but no PR #67 approval tables.

**Staging** currently records only:

| Recorded version | Name |
|---|---|
| `20261030052224` | `nova_durable_approval_lifecycle` |
| `20261030125402` | `mt5_customer_connections` |

**Repository main** contains the same migration names under different file versions:

| Main file version | Name | Production ledger | Staging ledger |
|---|---|---|---|
| `202610270001` | `mt5_customer_connections` | `20261027160402` | `20261030125402` |
| `202610300001` | `nova_durable_approval_lifecycle` | Not present | `20261030052224` |

This is not a safe basis for `db push`, `apply_migration`, `migration repair`, replaying SQL or creating a hosted branch. The version identifiers differ, and Staging does not have the Production baseline. Some SQL uses `CREATE OR REPLACE`, `IF NOT EXISTS` and policy replacement, but that does **not** prove replay safety or migration-history correctness.

**Required before any hosted DDL:**
1. Export the migration ledgers for both projects and preserve them as evidence.
2. Recover or reconstruct the source SQL for every Production migration that is absent from the current main tree, using reviewed repository history / authoritative migration artifacts.
3. Compare actual schema objects and migration checksums/version identifiers; do not reconcile by name alone.
4. Produce a reviewed migration alignment plan that explicitly separates Production and Staging.
5. Obtain approval before any hosted ledger repair, migration application or project mutation.

No Supabase development branch was created because the account is on Free and branch creation may incur compute charges.

### 3.3 Production public schema

Production currently has 19 public tables:

- `customer_profiles`
- `trading_sessions`
- `strategy_signals`
- `risk_guard_decisions`
- `security_events`
- `system_heartbeats`
- `ai_strategies`
- `customer_ai_subscriptions`
- `signal_delivery_log`
- `strategy_versions`
- `backtest_runs`
- `quality_gate_configs`
- `quality_gate_results`
- `learning_events`
- `mcp_tool_audit`
- `system_controls`
- `alpaca_oauth_states`
- `alpaca_connections`
- `broker_connections`

No Production table was found for tenant organizations/memberships, products, package versions, leads, customer consent, campaigns, offers, orders, payment events, payment subscriptions, marketing deliveries or marketing attribution.

Relevant existing semantics:

- `customer_profiles` is keyed by `user_id` → `auth.users(id)`; its role check is `customer | staff | admin`. It is a user profile, not an organization membership or tenant table. Do not overload its `role` field with marketer/sales/analyst or organization roles.
- `customer_ai_subscriptions` references `strategy_id`, `strategy_version` and optional `account_session_id`; its states are strategy lifecycle states. It is not a generic SaaS subscription or merchant checkout ledger.
- `broker_connections` is Exness MT5 Demo only, unique by `(user_id, provider, environment)`; customer INSERT is limited to a pending request with no route. Authenticated clients have SELECT/INSERT only. A trusted server/admin assigns the opaque route. Preserve this table and its constraints unchanged.
- Historical `alpaca_connections` and `alpaca_oauth_states` remain in the Production schema. Do not reuse them or drop their data in this workstream.

Production had 22 policies across 19 RLS-enabled public tables. The actual policies are primarily owner-scoped SELECT, staff-only SELECT, and explicit client-deny policies for historical token/delivery tables. Do not infer authorization from grants alone; inspect the policy and role grants together.

### 3.4 Staging public schema

Staging currently has eight public tables:

- `user_brokers`
- `ai_strategy_state`
- `video_histories`
- `bot_config`
- `latest_signal`
- `nova_agent_threads`
- `nova_approval_requests`
- `broker_connections`

Only three tables have RLS policies:
- `nova_agent_threads`: owner SELECT and owner INSERT policies.
- `nova_approval_requests`: owner SELECT policy.
- `broker_connections`: owner SELECT and pending Exness Demo INSERT policies.

Five tables have RLS enabled but no policies:
- `ai_strategy_state`
- `bot_config`
- `latest_signal`
- `user_brokers`
- `video_histories`

The Security Advisor reported five `rls_enabled_no_policy` findings. These tables also have broad `anon` and `authenticated` table grants. RLS with no applicable policy currently denies row access, but broad grants combined with future policy changes create unnecessary exposure risk. `user_brokers` includes legacy `api_key`, `api_secret_encrypted` and `passphrase_encrypted` columns. No values were read. These legacy tables are **not** a source for marketing data and their security remediation must remain a separate tracked task.

Staging's five effective policies cover only the three tables listed above. Do not treat Staging as a Production-like baseline or run customer acceptance there until the migration/schema/security baseline has been reconciled.

### 3.5 Existing approval schema and RPC boundary

Staging contains the PR #67 schema; Production does not.

The current `nova_approval_requests` table has:
- `thread_id`, `user_id`, `request_type`, `proposal`, `proposal_hash`, `policy_version`, `status`, decision note/payload and timestamps.
- `request_type` is constrained to exactly `strategy_draft_review`.
- `policy_version` is constrained to exactly `nova-approval.v1`.
- A composite owner/thread FK `(thread_id,user_id)` → `nova_agent_threads(id,user_id)`.
- A partial unique index allowing only one pending approval per thread.
- No `tenant_id` or `decided_by` field.

The current migration defines:
- `private.nova_valid_strategy_draft_proposal(jsonb)` for the five-field strategy proposal only.
- `private.nova_create_approval_impl(...)` and `private.nova_resolve_approval_impl(...)` as SECURITY DEFINER functions with `search_path = pg_catalog`, internally binding to `auth.uid()` and the owner thread.
- Public `nova_create_approval` and `nova_resolve_approval` functions as SECURITY INVOKER wrappers, with explicit execute grants to `authenticated` and no `PUBLIC`/`anon` execute.
- A trigger that protects immutable proposal fields, checks expiry/policy/transition, and prevents terminal-state replay.
- Database-side SHA-256 of the canonical JSONB proposal; the client hash is not trusted as the persisted integrity value.

The existing approval implementation is a useful durable lifecycle foundation, but it cannot approve a marketing campaign, package publish, offer send, price change or ad budget. Simply allowing extra `request_type` values would be unsafe: the current validator, policy-version checks, update trigger, owner-only resolver and API contracts are all strategy-specific.

**Reuse rule:** extend the same durable approval records and shared transition logic with typed marketing adapters. Do not create `nova_marketing_approvals` or a second approval engine. Keep the existing strategy RPC signatures and `strategy_draft_review` semantics backward-compatible.

### 3.6 Supabase Advisor snapshot

- Staging Security Advisor: five `rls_enabled_no_policy` findings as listed above.
- Staging Performance Advisor: one unindexed FK finding for `nova_approval_owner_thread_fk`, plus unused-index notices. Do not remove indexes without workload review.
- Production has separate historical advisor findings; no advisor remediation or billing change was performed in this W0 audit.

## 4. Corrected tenant and commercial semantics

The previous architecture proposal needs one important refinement before implementation:

**A marketing tenant is the seller/business workspace, not every buyer/customer.**

- A B2C solo seller can own a `personal` workspace.
- A B2B seller can own an `organization` workspace with multiple members and roles.
- A buyer/lead belongs to the seller's CRM as a customer record; that buyer does not need a NOVA tenant merely to receive an offer or buy a product.
- A person may be a member of more than one seller organization.
- The authenticated Supabase user remains the actor. Tenant IDs and roles sent by the browser or an AI model are only requested context and must be re-authorized server-side.
- `customer_profiles` remains the platform user profile; organization membership is separate.

Separate the commercial ledgers:

1. **NOVA platform billing:** what a seller pays NOVA for access to the Marketing & Sales SaaS plan and its entitlements.
2. **Tenant commerce:** what a seller's end-customer pays for the seller's product/service packages.

Do not conflate these with `customer_ai_subscriptions`, which currently represents customer strategy subscriptions. Do not create a payment provider integration or claim payment capability until a provider, currencies, fees, settlement, refunds, tax treatment and webhook contract are selected and reviewed.

## 5. Proposed additive migration design

This section is a design contract, not executable SQL. No migration file was created or applied in this W0 PR. When implementation is authorized, create migration files with the Supabase CLI `supabase migration new <descriptive_name>` and use the generated version; do not invent timestamps or edit hosted migration history manually.

### M0 — Migration-ledger alignment (blocking prerequisite)

No Marketing DDL until the Production/Staging/source mismatch in §3.2 is resolved. The reconciliation must not:
- blindly run `supabase db push`;
- replay a migration because its name matches but version differs;
- mark a migration applied without matching schema/checksum evidence;
- reset or rebase the existing Staging project;
- apply the PR #67 approval migration to Production without an explicit reviewed release plan.

The first implementation artifact should be a migration ledger reconciliation report, not a hosted schema change.

### M1 — Seller tenant foundation

Proposed new logical tables:

**`nova_marketing_tenants`**
- `id uuid primary key`
- `tenant_type`: `personal | organization`
- `display_name`, `status`, `created_by`, timestamps
- Unique and state constraints; no buyer-facing customer data in this table.

**`nova_marketing_memberships`**
- `tenant_id`, `user_id`, `role`, `status`, timestamps
- Primary key `(tenant_id,user_id)`
- Roles: `owner | admin | marketer | sales | analyst | viewer`
- Status: `invited | active | suspended | revoked`
- Retain revoked membership rows for audit; do not hard-delete history by default.

Required invariants:
- Personal workspace bootstrap is idempotent and bound to the authenticated user.
- Organization creation assigns the creator as owner in the same transaction.
- Invitation acceptance is single-use, expiring and bound to the invited identity.
- The caller cannot self-assign `owner` or `admin`.
- Every tenant-owned row has a tenant FK and same-tenant composite references where applicable.
- Membership role changes are audited and server-authorized.
- RLS is enabled on every new table; revoke broad default access and grant only the required table operations.
- Policies enforce active membership and action-specific roles. Prefer direct RLS membership predicates; if a helper is required, keep it in a non-exposed schema, derive actor identity internally from `auth.uid()`, set a fixed search path, revoke PUBLIC/anon execute, and run Supabase Advisors.

Do not add columns to `customer_profiles` to model organization membership.

### M2 — Product and package catalog

Proposed logical tables:
- `nova_marketing_products`
- `nova_marketing_packages`
- `nova_marketing_package_versions`
- `nova_marketing_package_items`

Use immutable published package/price versions. Store money in integer minor units with an explicit ISO currency; never use floating-point currency. A price change creates a new version and does not rewrite existing offers or orders. Package items must reference products in the same tenant. Validate product types, billing model, interval, tax behavior, included quantity and entitlement definitions with strict versioned schemas.

AI can draft catalog descriptions or recommend a bundle. It cannot publish a package, set an unbounded discount, or mutate a live price.

### M3 — CRM, consent and follow-up

Proposed logical tables:
- `nova_marketing_leads`
- `nova_marketing_consents`
- `nova_marketing_suppressions`
- `nova_marketing_followups`

Keep lead deduplication tenant-scoped; never use global email/phone lookup across seller tenants. Store only necessary PII. Consent is purpose + channel + source + policy version + timestamp, with append-only changes. Withdrawal and suppression take precedence and are checked immediately before delivery, not just when a campaign is drafted.

AI lead scoring is advisory, versioned and traceable. A follow-up suggestion is not permission to send a message.

### M4 — Typed extension of PR #67 durable approval

Prerequisite: migration-ledger alignment and proof that the same PR #67 schema is available in the target environment.

Extend the existing `nova_approval_requests` lifecycle in place; do not create a parallel approvals table. The detailed migration review must cover:

- Add nullable tenant binding and decision-actor attribution (for example `tenant_id` and `decided_by`) without changing historical strategy rows.
- Keep existing `user_id` semantics as the request creator/owner for old strategy approvals.
- Add only explicit request kinds, such as `marketing_package_publish`, `marketing_campaign_publish`, `marketing_offer_send`, `marketing_price_change` and `marketing_ad_budget`.
- Add a marketing-specific policy version; retain `nova-approval.v1` for the current strategy workflow.
- Add a strict, separate validator for each marketing proposal type. Do not route marketing JSON through `nova_valid_strategy_draft_proposal`.
- Preserve server-side canonical payload hashing, expiry, immutable fields, single-use decision and replay denial.
- Keep public existing strategy RPC signatures and response semantics unchanged. Add narrowly typed marketing RPC adapters that delegate to the shared lifecycle core.
- Marketing decision authorization must validate current active tenant membership and the approver role. Preserve creator identity separately from `decided_by`.
- Keep strategy approval rows owner-only. Any tenant-member read policy must apply only to the explicitly typed marketing request kinds and must not expose strategy threads or other tenants.
- Preserve the current one-pending-approval-per-thread constraint in the first release; do not drop or weaken it without a separate concurrency design.
- An approval decision records authorization; it does not publish, send, spend, charge or grant entitlements. A separate dispatcher revalidates policy and claims a durable idempotent action record.

A same-user owner approval may be allowed for a personal workspace. Organization policy can require an approver role distinct from the author. That separation is enforced by the server/database, not by a UI-only check.

### M5 — Commerce and entitlements (after provider selection)

Proposed logical areas:
- Tenant end-customer orders and immutable order-item snapshots.
- Platform billing subscriptions for seller SaaS plans.
- Provider payment events with signature verification and event deduplication.
- Entitlements derived only from verified provider state.
- Append-only server-measured usage events.

Use hosted checkout/tokenization; NOVA must never store PAN, CVV or bank login. Browser redirect success is not payment proof. Webhook signature, timestamp/replay window, event ID uniqueness, idempotency and reconciliation are mandatory. Model ambiguous provider outcomes explicitly; do not blindly retry a payment/refund/send when the external outcome is unknown.

No provider has been selected in W0, so no payment schema should be applied yet.

### M6 — Campaigns, channel adapters and durable action dispatch

Proposed logical areas:
- Campaign and immutable campaign versions.
- Audience definitions using bounded, allowlisted filters (never arbitrary SQL).
- Channel capability registry and provider connection metadata.
- Delivery records and durable action outbox with idempotency.
- Attribution events and metric definitions.

Website and inbound NOVA chat are first-party surfaces. Social and Ads require official provider APIs, approved scopes, OAuth state/PKCE where supported, token vault readiness, provider policy review, consent/suppression checks and staging tests. No channel is active merely because its enum exists.

AI may prepare content and targeting recommendations. Human approval is required for outbound publication, outbound messaging, price/discount changes and ad spend. After approval, the dispatcher re-checks exact payload hash, tenant role, policy version, consent, suppression, budget and provider capability. Record success/failure/unknown outcome for reconciliation.

## 6. API contract design

Do not add a second gateway or move sales authorization into the AI Worker. Add same-origin Next.js route handlers under the existing frontend API boundary after the tenant/schema foundation is approved.

All protected requests:
- verify the current Supabase session server-side with `auth.getUser()`;
- resolve active tenant membership and role from database state on every request;
- never trust caller-supplied `tenant_id`, `user_id`, role, owner or provider account as authorization;
- use strict request/response schemas and bounded body sizes;
- return `Cache-Control: no-store` for private data;
- use stable machine error codes and correlation IDs;
- use `Idempotency-Key` for create/send/checkout/dispatch operations;
- return non-enumerating 404 for foreign-tenant resources.

Proposed route families (not yet present):

| Method + path | Purpose | Required gate |
|---|---|---|
| `GET /api/marketing/context` | List memberships/active tenant context | Authenticated; server-derived memberships |
| `POST /api/marketing/organizations` | Create organization workspace | Authenticated; atomic owner membership |
| `GET/POST /api/marketing/products` | List/create product drafts | Tenant viewer/read or marketer/write |
| `GET/POST /api/marketing/packages` | List/create package drafts | Tenant role; published versions immutable |
| `POST /api/marketing/packages/:id/versions` | Create package version | Same-tenant products; schema validation |
| `GET/POST /api/marketing/leads` | List/create leads | Sales/marketer role; PII and consent checks |
| `POST /api/marketing/leads/:id/consents` | Record grant/withdrawal | Append-only evidence |
| `GET/POST /api/marketing/campaigns` | List/create campaign drafts | Marketer role; no publish side effect |
| `POST /api/marketing/campaigns/:id/generate` | Generate draft content | Existing NOVA AI Worker; structured output only |
| `GET /api/marketing/approvals` | List tenant marketing approvals | Tenant approver role; typed request kinds only |
| `POST /api/marketing/approvals/:id/decision` | Approve/reject exact proposal | Membership + role + hash + expiry + replay checks |
| `POST /api/marketing/campaigns/:id/publish` | Dispatch approved version | Exact approval + consent + capability + outbox |
| `POST /api/commerce/checkout-sessions` | Create hosted checkout | Buyer/tenant binding; published price; idempotency |
| `POST /api/webhooks/payments/:provider` | Receive payment event | Provider signature/replay verification |
| `GET /api/commerce/entitlements` | Read entitlements | Verified order/subscription state only |

A tenant approver must not need to read the author's private chat transcript merely to decide a marketing proposal. The approval-list and decision endpoints should authorize the typed approval record by tenant membership, not by broadening access to all `nova_agent_threads`.

Common error contract:
- `authentication_required` → 401
- `tenant_access_denied` / foreign resource → 404 or 403 according to non-enumeration policy
- `role_insufficient` → 403
- `validation_failed` → 400
- `approval_required`, `approval_expired`, `approval_hash_mismatch` → 409/410
- `consent_required`, `recipient_suppressed` → 409
- `idempotency_conflict` → 409
- `quota_exceeded` → 429
- `provider_unavailable` → 503

No API should return raw provider bodies, OAuth tokens, secret references with retrieval power, database errors or stack traces.

## 7. Contract-test design

Use the existing Node built-in test runner and disposable local Supabase/PostgreSQL patterns. The current `frontend/package.json` has no general `test` script; CI invokes `node --test` directly. Do not invent a parallel test framework.

### 7.1 Static migration and contract tests

Proposed test files, to be created with the implementation PR:
- `tests/nova-marketing-migration.test.mjs`
- `tests/nova-marketing-api.test.mjs`
- `tests/nova-marketing-contract.test.mjs`
- `tests/sql/nova-marketing-migration.integration.sql`
- `frontend/scripts/nova-marketing-local-supabase.integration.mjs`

Static migration tests must assert:
- every tenant-owned table enables RLS;
- default/public/anon privileges are revoked and only minimum grants are present;
- all cross-tenant relationships use tenant-safe FKs or server-validated equivalents;
- published package/price versions and order snapshots are immutable;
- role and status constraints reject unknown values;
- no broad `SECURITY DEFINER` function is exposed in `public`;
- any privileged helper is in a non-exposed schema, checks `auth.uid()`, has a fixed search path and explicit execute grants;
- no destructive DDL, table drops, data deletion, provider writes or trading capabilities appear in the marketing migration;
- PR #67 strategy validator/RPC behavior remains backward-compatible.

### 7.2 PostgreSQL two-user / two-tenant tests

Create only synthetic users A and B and synthetic tenants X and Y in an ephemeral database. Test:

| Test | Expected result |
|---|---|
| A creates personal tenant | One tenant and owner membership; idempotent retry returns same logical result |
| A creates organization | A becomes owner atomically |
| A reads own tenant/membership | Allowed |
| B reads A's tenant by guessed UUID | No row / non-enumerating denial |
| A creates product in X | Allowed for owner/marketer |
| Viewer creates/edits product | Denied |
| Sales role edits price/package | Denied unless explicitly granted |
| A references product in tenant Y | FK/authorization rejection |
| Client supplies another `user_id` / `tenant_id` | Rejected or ignored; actor derived from JWT |
| Membership revoked | All subsequent writes/reads requiring active membership denied |
| Published price version update/delete | Rejected |
| Order item references another tenant's package | Rejected |
| Consent withdrawal | Append-only record; future send gate blocks |
| Suppressed recipient | Delivery dispatch denied |
| Usage event duplicate idempotency key | No duplicate chargeable usage |

### 7.3 Approval lifecycle regression and marketing extension tests

Run the existing tests unchanged:
- `tests/nova-approval-api.test.mjs`
- `tests/nova-approval-contract.test.mjs`
- `tests/nova-approval-migration.test.mjs`
- `tests/sql/nova-approval-migration.integration.sql`
- `frontend/scripts/nova-approval-local-supabase.integration.mjs`

Additional marketing approval cases:
- creator must be an active member of the target tenant;
- only allowlisted request types and exact proposal schemas are accepted;
- strategy requests still use the original strategy validator and `nova-approval.v1`;
- marketing requests use a marketing-specific policy version and validator;
- proposal hash is recomputed in Postgres from canonical JSONB;
- changing content, audience, package/price version, discount, channel or budget invalidates the prior approval;
- unauthorized tenant member cannot view or decide another tenant's approval;
- approver role is checked at decision time, not only request creation;
- revoked/suspended approver is denied;
- optional four-eyes rule rejects self-approval for organization policies that require separation;
- expired, stale-policy, hash-mismatch, duplicate and replay decisions are rejected;
- approval records decision actor and never directly trigger provider side effects;
- existing strategy approval remains owner-only and passes its prior regression suite.

### 7.4 Local Supabase Auth + real API contract tests

Extend the existing disposable local-stack harness pattern:
- create two synthetic Auth users with real local JWTs;
- exercise the actual Next.js API routes and local PostgREST;
- verify 401 unauthenticated/invalid token, role denial, tenant A/B isolation, unknown-field rejection, body-size/content-type rejection, no-store headers and stable error codes;
- verify browser payloads/responses/logs do not contain secrets or service-role keys;
- verify idempotent create/send/checkout requests do not duplicate records;
- test provider webhook signature and replay behavior with local deterministic fixtures only;
- use mocked provider adapters; CI must not publish social content, send messages, create real checkout sessions or spend ad budget.

### 7.5 Payment, delivery and side-effect tests

- Invalid webhook signature: reject and do not grant entitlement.
- Valid duplicate webhook event: one durable event and one state transition.
- Browser checkout success redirect without verified webhook: entitlement remains inactive.
- Provider timeout/ambiguous outcome: mark outcome unknown and reconcile; do not blindly retry.
- Consent revoked after approval but before send: dispatch is blocked.
- Audience/content/budget changed after approval: dispatch is blocked and new approval required.
- Provider kill switch or tenant suspension: no outbound action.
- AI tool request to publish/spend/change price: denied without a valid human approval and deterministic policy.

### 7.6 CI integration

The existing `frontend-ci.yml` already runs Node tests for `tests/**` and triggers on `supabase/migrations/**`. The approval-specific workflow currently lists only the existing approval/MT5 files. When the marketing migration and test harness are implemented, extend that workflow's `pull_request.paths` and `push.paths` so exact migration/SQL/local-Supabase tests run on the relevant changes.

Keep PR-controlled CI secret-free. Hosted staging credentials must not be made available to arbitrary pull-request code. Local Supabase must use generated disposable credentials and localhost URLs only.

## 8. W0 findings and priority

| Priority | Finding | Impact | Required action |
|---|---|---|---|
| P0 | Production/Staging migration ledgers diverge; migration versions differ from main files | Any hosted migration can replay or leave environments inconsistent | Reconcile migration source/history before DDL |
| P0 | PR #67 approval schema exists in Staging but not Production | Marketing approval extension cannot be assumed available in all environments | Preserve #67; plan controlled baseline alignment |
| P1 | Staging has five RLS-enabled/no-policy tables with broad anon/auth grants | Legacy schema exposure risk; `user_brokers` contains secret-like columns | Keep separate security workstream; no marketing reuse |
| P1 | Existing approval is strategy-only and owner-only | Marketing/team approval cannot safely reuse current RPC unchanged | Typed extension design and regression tests |
| P1 | No seller tenant/membership model | No trustworthy B2B authorization boundary | M1 tenant foundation |
| P1 | No marketing/CRM/package/payment API or schema | No existing implementation to extend | Additive domain implementation after M0 |
| P2 | No payment provider or market/jurisdiction decision | Checkout and tax contracts cannot be finalized | Provider/legal/commercial review before M5 |
| P2 | Approval-specific workflow path filters need extension | New migration tests could be skipped by that workflow | Update workflow path filters with implementation |

## 9. W0 exit criteria

W0 can be marked complete only when:
- [x] Exact main SHA and recursive tree inspected.
- [x] All current main Supabase migration files inventoried.
- [x] Production and Staging project metadata, tables, columns, FKs and migration ledgers inspected read-only.
- [x] RLS policies, role grants, routines, triggers and Supabase Advisor findings inspected.
- [x] Existing Next.js API routes, Auth helper, approval contract and current test harness inspected.
- [x] PR #67 preserved as permanent approval dependency.
- [x] Existing Master Tracker Issue #36 retained; no duplicate tracker/automation created.
- [x] Additive migration sequence and contract-test matrix designed.
- [ ] Production/Staging migration-ledger reconciliation report completed.
- [ ] Missing Production migration source artifacts recovered/reviewed.
- [ ] Marketing approval extension reviewed against PR #67 and target schema.
- [ ] Owner review of migration and test design.
- [ ] Implementation branch and exact-head CI for the first migration/test PR.

The first eight inspection/design criteria are complete. The final four remain blocked or pending. Do not claim W0 is fully closed until the migration baseline and approval extension are reviewable.

## 10. Safety and non-effects

This W0 audit performed read-only GitHub and Supabase metadata/catalog inspection and created a documentation-only branch artifact.

It did **not**:
- apply, repair, reset or roll back any Supabase migration;
- create/drop/alter any table, policy, grant, trigger, function or row;
- create a Supabase development branch or incur compute;
- create test users or use production customer data;
- read or reveal API keys, broker credentials, payment credentials or secret contents;
- change Cloudflare Worker bindings, Netlify configuration, DNS or deployment;
- connect social/advertising/payment providers or send outbound content;
- enable checkout, subscriptions, refunds, ad spend or campaign publishing;
- enable broker order submission, position mutation or Live Trading.

Existing safety invariants remain: Exness Demo read-only; broker order submission OFF; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

## 11. Master Tracker continuity

Continue to use the existing Master Tracker only:
- Issue #36: Track NOVA development, verification and activation gates.
- Existing automation ID: `6ae3f12712a88191b2eab90a138d7270`; do not create another tracker or automation.
- PR #67 remains a permanent approval lifecycle subtracker even though GitHub PR metadata reports it merged.
- PR #129 remains the parent Marketing & Sales architecture proposal.
- This W0 audit is a child evidence artifact; link it to Issue #36 and PR #129.

The last automation peek showed the existing automation enabled with its daily `18:00 Asia/Bangkok` schedule, but the latest recorded run was `in_progress` and `next_run_time` was null. Do not claim scheduler delivery or a completed run until a completed result is recorded.

## 12. Next authorized engineering sequence

1. Complete migration-ledger/source reconciliation as a separate read-only evidence task.
2. Review this W0 schema/API/approval design and PR #129 together.
3. After review, implement only M1 tenant foundation and its local SQL/API contract tests on a feature branch from the then-current main.
4. Require two-user/two-tenant local Supabase tests and unchanged PR #67 regression tests before proceeding to package catalog or CRM.
5. Keep M2 Package Catalog and M3 CRM separate, additive and independently reviewable.
6. Do not apply hosted migrations, activate providers, publish campaigns, send outbound messages, create paid checkouts or spend ad budget without separate explicit authorization.

**Change log:** 2026-10-31 — W0 repository/schema/API audit and additive migration/contract-test design recorded against main SHA `a2acfd8ec9b598e6593413549bef760e8f596a72`. No runtime or hosted changes.
