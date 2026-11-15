# NOVA Marketing & Sales Engine — Technical Architecture, Data Model, API Contracts & Delivery Backlog

**Status:** Architecture proposal; not runtime implementation or launch approval  
**Decision:** Multi-business / multi-market product architecture; hybrid one-time, subscription and usage-based commerce; approval-gated automation  
**Channels in scope:** NOVA website, NOVA AI chat, social platforms, advertising platforms  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical base:** `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Related work:** Issue #80 / Draft PR #81 (business model and unit economics), Issue #78 / Draft PR #79 (provider identity and tenant onboarding), Issue #82 (customer-owned workspace), PR #67 (durable approval lifecycle), PR #89 (Zero-Menu and agent architecture), PR #101 (path inventory proposal)

## 1. Executive decision and scope

NOVA Marketing & Sales Engine is a tenant-scoped commercial workflow capability inside the existing NOVA application. It supports multiple business types and product/service catalogs without assuming that every market, channel, payment provider, or jurisdiction is approved for launch.

The engine supports:

- **Market model:** multi-business and multi-market data model; launch geography, business verticals and supported jurisdictions remain explicitly configured.
- **Customer model:** B2C personal tenants and B2B organization tenants with membership and role controls.
- **Commerce model:** one-time purchases, recurring subscriptions, metered/usage billing, and mixed bundles.
- **Channels:** first-party website and authenticated NOVA chat; external social and advertising channels through approved provider adapters.
- **Automation posture:** AI may research, classify, draft, recommend, forecast and prepare actions. Publishing, outbound messaging, price/discount changes, ad spend, checkout exceptions, refunds and other consequential actions require a recorded human approval. No autonomous spending or publishing is enabled by this specification.

This document is a technical extension, not a replacement for the commercial assumptions in Issue #80 / PR #81. PR #81 remains the source for proposed Thailand-first B2C/B2B pricing hypotheses and unit-economics assumptions. Do not duplicate or silently turn those hypotheses into approved price points. The broader architecture in this document does not imply a global launch.

### Non-goals

- No second frontend, CRM gateway, AI gateway, System Integration Hub, generic approval engine, payment processor, or secret manager.
- No arbitrary model-generated HTML/JavaScript, URLs, SQL, provider identifiers, or API calls.
- No scraping or unsolicited messaging; channel access must follow provider terms, consent, opt-out and applicable law.
- No custody of customer funds or storage of card/bank credentials.
- No automatic investment advice, broker execution, order submission, or trading capability.
- No production database migration, provider credential, hosted configuration, ad account, payment account, or deployment is authorized by this design PR.

## 2. Repository-first architecture constraints

The exact `main` inventory was checked before this proposal. Reuse these existing components:

| Existing component | Reuse boundary |
|---|---|
| `frontend/` Next.js application, Netlify target | One customer-facing UI; add marketing/sales views to the existing app |
| `frontend/app/api/` authenticated route handlers | Same-origin API facade; verify Supabase session before protected operations |
| NOVA AI Worker | Bounded LLM generation/classification only; no authorization or payment authority |
| NOVA System Integration Hub | Existing integration/provider control plane only; do not overload it as CRM or sales orchestration |
| Supabase Auth + RLS | Identity, user sessions and row-level tenant isolation |
| `nova_agent_threads` / `nova_approval_requests` | Existing durable approval foundation; extend by reviewed additive migration and typed request contracts only |
| Existing audit/security patterns | Sanitized audit, correlation IDs, fail-closed behavior and owner-scoped access |
| Existing Zero-Menu intent contract | Typed intent and fixed component catalog; never execute model-supplied UI code |

**Important PR #67 compatibility finding:** the merged approval migration currently constrains `request_type` to `strategy_draft_review` and validates a fixed five-field strategy proposal. It cannot directly approve a campaign publish, price change or ad-spend action. Reuse its ownership, immutability, expiry, one-time decision and replay-resistance design; extend it through a separately reviewed additive migration and strict versioned request schemas. Do not create a parallel generic approval table or treat a strategy-draft approval as marketing authorization.

**Path policy:** preserve current paths. Proposed route names and tables below are targets only. Recheck the current `main` SHA, recursive tree, imports, migration inventory, grants, RLS and exact existing route methods before every implementation PR. Follow the repository delivery verification plan and path inventory conventions.

## 3. Logical architecture

```text
Customer / Business Operator
        |
        v
NOVA Frontend (Netlify, existing Next.js app)
  - Marketing workspace / CRM / catalog / packages
  - Campaign composer / sales inbox / checkout entry
  - Approval inbox / analytics
        |
        v
Same-origin authenticated Next.js API facade
  - Supabase session verification
  - Tenant + role + entitlement checks
  - Input schemas, rate limits, idempotency
        |
        +-------------------------------+
        |                               |
        v                               v
NOVA Marketing Domain Services      NOVA AI Worker
(deterministic policy/workflows)    (bounded draft/research only)
        |                               |
        |<----- typed draft output -----+
        |
        +--> Catalog & Package service
        +--> Lead / CRM service
        +--> Campaign / Offer service
        +--> Approval lifecycle (existing NOVA approval foundation,
        |    extended with typed marketing request kinds)
        +--> Channel adapters (website/chat/social/ads)
        +--> Commerce adapter (hosted checkout / signed webhooks)
        +--> Analytics & attribution
        |
        v
Supabase Postgres + RLS
  - personal/org tenant records
  - products, packages, price versions, entitlements
  - leads, consent, campaigns, offers, orders
  - subscriptions, usage, delivery, attribution, audit
        |
        v
External providers via fixed allowlisted adapters
  - social publishing APIs
  - advertising APIs
  - payment/checkout providers
```

### Service ownership

1. **Frontend** renders approved data and collects explicit user decisions. It is not an authorization boundary.
2. **API facade** verifies the current Supabase session and resolves tenant membership, role, consent, package entitlement and policy on every protected request.
3. **Domain services** own deterministic state transitions, pricing rules, quota enforcement, idempotency and approval gates.
4. **AI** produces structured drafts and recommendations only. It cannot create authority, publish, send, change price, spend budget or mark an invoice paid.
5. **Provider adapters** are server-side, fixed-origin and capability-allowlisted. Secrets remain in the approved server-side vault path; never pass credentials to browser, model, MCP, logs or analytics.
6. **Database** is the durable source for business state. RLS is defense in depth; sensitive state transitions use narrow server-side functions and verified owner context.

### Runtime recommendation

Start with the existing Next.js API facade and a bounded domain module colocated with the existing application/server code where that matches current repository conventions. Keep LLM inference on the existing NOVA AI Worker. Introduce a separate background worker/queue only when measured campaign, webhook or analytics volume requires it and the target runtime, retry semantics, observability and deployment ownership are approved. Do not create a new Cloudflare Worker merely to mirror existing gateways.

Long-running campaign generation, audience aggregation and analytics should be asynchronous. Synchronous requests must have strict payload, timeout and retry bounds.

## 4. Domain model and tenant model

### 4.1 Tenant identity

- A **personal tenant** represents one B2C customer.
- An **organization tenant** represents a B2B business with multiple members.
- Every tenant-owned record includes `tenant_id`; actor identity is derived from the verified Supabase session.
- `tenant_id`, `user_id`, role, provider account, campaign owner and customer identity supplied by the browser or LLM are never trusted as authorization claims.
- A user may belong to multiple organizations. Each request resolves the active tenant and verifies current membership and role server-side.
- Cross-tenant access is denied even when a caller guesses a valid UUID.
- The exact mapping from existing Supabase users to personal tenants and organization membership must be audited before migrations. Do not infer that a broker connection row is a business tenant.

### 4.2 Main entities

| Entity | Purpose | Key invariants |
|---|---|---|
| Tenant / Membership | B2C or B2B boundary and roles | Server-resolved membership; unique tenant/user membership |
| Product / Service | Sellable catalog item | Tenant-owned; active/archived lifecycle |
| Package / Package Version | Bundle, tier or service plan | Immutable published versions; references products and entitlements |
| Price Version | Currency, billing model and price | Immutable once used in an offer/order; explicit tax/fee treatment |
| Entitlement | Access granted by purchase/subscription | Derived from verified payment/order state, never browser claims |
| Lead / Customer Profile | Sales prospect and customer lifecycle | PII minimization, provenance and tenant ownership |
| Consent / Suppression | Channel permissions and opt-outs | Purpose + channel + source + timestamp; suppression takes precedence |
| Campaign / Asset | Marketing campaign and content drafts | Versioned; AI-generated content is draft-only |
| Offer | Personalized quote or package proposal | References published package/price version; expires; immutable hash |
| Approval | Human decision for consequential action | Reuse existing NOVA approval lifecycle with typed, versioned marketing proposal |
| Order / Order Item | Purchase intent and immutable line snapshot | Idempotent; records exact package/price/tax/currency at purchase |
| Payment Event | Provider webhook/reconciliation event | Signature-verified, deduplicated, append-oriented |
| Subscription | Recurring commercial relationship | Provider reference only; lifecycle reconciled from verified events |
| Usage Event | Metered usage | Append-only, idempotency key, server-measured quantity |
| Follow-up Task / Delivery | Sales follow-up and outbound message | Consent checked at send time; retry safe; delivery outcome recorded |
| Attribution Event | Campaign/source analytics | Data minimization; no cross-tenant aggregation of private data |
| Audit Event | Security and business action history | Actor, tenant, action, outcome, correlation; no secrets or unnecessary PII |

## 5. Proposed database schema (logical; additive migration only)

The following names are proposed logical names, not a claim that tables exist on `main`. Before implementation, inspect all current migrations, policies, grants, RPCs and table definitions. Use a consistent `nova_marketing_` prefix to avoid collisions and make ownership clear.

### 5.1 Tenant and membership

**`nova_marketing_tenants`**
- `id uuid primary key`
- `tenant_type text check in ('personal','organization')`
- `display_name text`
- `status text check in ('active','suspended','closed')`
- `created_by uuid references auth.users`
- `created_at, updated_at timestamptz`

**`nova_marketing_memberships`**
- `tenant_id uuid references nova_marketing_tenants`
- `user_id uuid references auth.users`
- `role text check in ('owner','admin','marketer','sales','analyst','viewer')`
- `status text check in ('invited','active','suspended','removed')`
- `created_at, updated_at timestamptz`
- Primary key `(tenant_id,user_id)`; indexes on `(user_id,status)`.

Personal-tenant bootstrap must be idempotent and bind to the authenticated user. Organization membership changes require owner/admin authorization and audit events. Do not allow a user to self-assign an organization role.

### 5.2 Catalog and packaging

**`nova_marketing_products`**
- `id, tenant_id uuid`
- `sku text`, `name text`, `description text`
- `product_type text` (digital, service, physical, usage, other allowlisted values)
- `status text` (draft, active, archived)
- `metadata jsonb` with strict allowlisted non-secret fields
- `created_by, created_at, updated_at`

**`nova_marketing_packages`**
- `id, tenant_id uuid`, `code text`, `name text`
- `status text` (draft, active, archived)
- `published_version_id uuid null`
- `created_by, created_at, updated_at`
- Unique `(tenant_id,code)`.

**`nova_marketing_package_versions`**
- `id, tenant_id, package_id uuid`
- `version integer`, `status text` (draft, approved, published, retired)
- `billing_model text` (one_time, subscription, usage, hybrid)
- `currency char(3)`
- `price_minor bigint` (integer minor units; no floating-point currency)
- `billing_interval text null` (day, week, month, year from allowlist)
- `usage_metric text null`, `included_quantity numeric null`
- `tax_behavior text` (exclusive, inclusive, not_applicable, unknown)
- `effective_from, effective_until timestamptz null`
- `content jsonb` and `entitlements jsonb` validated against versioned schemas
- `content_hash text`, `created_by, created_at`
- Unique `(tenant_id,package_id,version)`; published versions immutable.

**`nova_marketing_package_items`**
- `tenant_id, package_version_id, product_id uuid`
- `quantity numeric`, `item_type text`
- Composite foreign keys must ensure package/product belong to the same tenant.

Do not store a mutable price on the product and then silently change historical orders. A published price version is immutable; price changes create a new version. AI may recommend a package but may only quote a currently approved price version and server-computed eligibility.

### 5.3 Leads, customers and consent

**`nova_marketing_leads`**
- `id, tenant_id uuid`
- `source_channel text` (website, chat, social, ads, referral, import)
- `source_reference text null` (opaque provider reference, not a credential)
- `display_name text null`, `email_normalized text null`, `phone_e164 text null`
- `lifecycle_stage text` (new, qualified, contacted, proposal, customer, lost, suppressed)
- `lead_score numeric null` plus `score_version text null` and `scored_at timestamptz null`
- `owner_user_id uuid null`, `created_at, updated_at`
- Unique/deduplication rules must be tenant-scoped and privacy-reviewed; do not use global email lookup across tenants.

**`nova_marketing_consents`**
- `id, tenant_id, lead_id uuid`
- `channel text` (email, social_dm, sms, chat, ads_audience)
- `purpose text`, `status text` (granted, denied, withdrawn)
- `source text`, `captured_at, expires_at timestamptz null`
- `evidence_reference text null`, `policy_version text`
- Append consent changes; never overwrite history.

**`nova_marketing_suppressions`**
- `tenant_id uuid`, `channel text`, `recipient_hash text`, `reason_code text`, `created_at timestamptz`
- Unique `(tenant_id,channel,recipient_hash)`; store the minimum data needed to prevent re-contact.
- Check suppression immediately before every delivery, not only when a campaign is drafted.

### 5.4 Campaigns, offers and approval

**`nova_marketing_campaigns`**
- `id, tenant_id uuid`
- `name text`, `objective text`, `channel text` (website, chat, social, ads)
- `status text` (draft, awaiting_approval, approved, scheduled, publishing, active, paused, completed, failed, cancelled)
- `audience_definition jsonb` (allowlisted, bounded, tenant-scoped; no arbitrary SQL)
- `budget_minor bigint null`, `currency char(3) null`
- `starts_at, ends_at timestamptz null`
- `current_version integer`, `created_by, created_at, updated_at`

**`nova_marketing_campaign_versions`**
- `id, tenant_id, campaign_id uuid`, `version integer`
- `content jsonb`, `asset_refs jsonb`, `targeting jsonb`
- `content_hash text`, `policy_version text`, `created_by, created_at`
- Immutable after approval; edits create a new version and invalidate prior approval.

**`nova_marketing_offers`**
- `id, tenant_id, lead_id uuid`
- `package_version_id uuid`, `currency char(3)`, `subtotal_minor bigint`, `tax_minor bigint null`, `total_minor bigint`
- `discount_minor bigint default 0`, `discount_policy_id uuid null`
- `status text` (draft, awaiting_approval, approved, sent, accepted, declined, expired, withdrawn)
- `expires_at timestamptz`, `offer_hash text`, `created_by, created_at`
- The server computes all amounts. Discounts are bounded by an approved policy; no negative/zero total unless explicitly permitted by policy.

**Approval extension:** add only explicit typed request kinds (for example `marketing_campaign_publish`, `marketing_offer_send`, `marketing_price_change`, `marketing_ad_budget`) to the existing durable NOVA approval lifecycle after review of its current SQL/API invariants. Each request stores a canonical immutable proposal hash, policy version, expiry and tenant/owner binding. The decision endpoint must re-check the current actor's role and tenant membership. A decision authorizes only the exact approved payload hash and action kind; any edit, audience change, creative change, price change, channel change or budget change requires a new approval. Use a single-use transition and idempotent action dispatch. Do not create a generic “approved = execute anything” capability.

### 5.5 Orders, payments, subscriptions and usage

**`nova_marketing_orders`**
- `id, tenant_id uuid`, `customer_lead_id uuid null`, `buyer_user_id uuid null`
- `status text` (draft, pending_payment, paid, failed, cancelled, refunded, partially_refunded)
- `currency char(3)`, `subtotal_minor bigint`, `tax_minor bigint`, `discount_minor bigint`, `total_minor bigint`
- `idempotency_key text`, `created_at, updated_at`
- Unique `(tenant_id,idempotency_key)`.

**`nova_marketing_order_items`**
- `id, tenant_id, order_id uuid`
- `package_version_id uuid`, `description_snapshot jsonb`
- `quantity numeric`, `unit_price_minor bigint`, `line_total_minor bigint`
- Snapshot exact commercial terms; do not join current package price to rewrite history.

**`nova_marketing_payment_events`**
- `id, tenant_id, order_id uuid`
- `provider text`, `provider_event_id text`, `event_type text`
- `verified_at timestamptz`, `received_at timestamptz`, `payload_digest text`
- `processing_status text` (received, processed, ignored, failed)
- Unique `(provider,provider_event_id)`; do not store PAN, CVV, bank passwords or raw credential-bearing payloads.

**`nova_marketing_subscriptions`**
- `id, tenant_id, order_id uuid`, `provider text`, `provider_subscription_ref text`
- `status text` (trialing, active, past_due, paused, cancelled, expired)
- `current_period_start, current_period_end timestamptz`
- `cancel_at_period_end boolean`, `created_at, updated_at`
- Unique provider reference within the appropriate provider/account scope.

**`nova_marketing_entitlements`**
- `id, tenant_id, subject_user_id uuid null, organization_id uuid null`
- `package_version_id uuid`, `source_order_id uuid`, `status text`
- `starts_at, ends_at timestamptz null`, `limits jsonb`, `created_at, updated_at`
- Entitlements are issued/revoked by trusted server logic only after verified provider events and reconciliation. A client cannot grant itself a plan by posting `paid=true`.

**`nova_marketing_usage_events`**
- `id, tenant_id, entitlement_id uuid`, `metric text`, `quantity numeric`
- `source_operation_id text`, `occurred_at timestamptz`, `metadata jsonb`
- Unique `(tenant_id,source_operation_id,metric)`; append-only, server-measured usage.

### 5.6 Follow-up, delivery, attribution and audit

**`nova_marketing_followups`**
- `id, tenant_id, lead_id uuid`, `due_at timestamptz`, `task_type text`
- `status text` (pending, approved, running, completed, cancelled, failed)
- `assigned_user_id uuid null`, `source_offer_id uuid null`, `created_at, updated_at`
- AI can suggest a follow-up; actual send requires valid consent, suppression check and applicable approval.

**`nova_marketing_deliveries`**
- `id, tenant_id, campaign_version_id uuid null, lead_id uuid null`
- `channel text`, `provider text`, `provider_message_ref text null`
- `status text` (queued, sent, delivered, bounced, failed, suppressed)
- `idempotency_key text`, `sent_at, delivered_at timestamptz null`
- Unique `(tenant_id,idempotency_key)`; sanitized provider response only.

**`nova_marketing_attribution_events`**
- `id, tenant_id uuid`, `campaign_id uuid null`, `lead_id uuid null`, `order_id uuid null`
- `event_type text`, `source_channel text`, `occurred_at timestamptz`, `metadata jsonb`
- Apply retention and aggregation limits; do not export personal data to advertising providers without explicit lawful basis and consent.

**`nova_marketing_audit_events`**
- `id, tenant_id uuid`, `actor_user_id uuid null`, `actor_type text`
- `action text`, `resource_type text`, `resource_id uuid null`, `outcome text`
- `correlation_id uuid`, `policy_version text`, `created_at timestamptz`, `metadata jsonb`
- Append-only from application roles; exclude tokens, secrets, raw payment payloads and unnecessary PII.

### 5.7 Database implementation rules

- Enable RLS on every tenant-owned table. Default deny; policies must resolve active membership through a trusted relation and enforce role where writes are permitted.
- Use composite tenant foreign keys (for example `(tenant_id, package_id)`) to prevent cross-tenant references.
- Revoke broad `PUBLIC`, `anon` and `authenticated` table privileges; grant only the minimum operations needed by the actual API pattern.
- Use narrow `SECURITY INVOKER` public wrappers and narrowly scoped private `SECURITY DEFINER` implementations only when necessary. Fix `search_path`; verify function owner, execute grants and auth.uid() checks.
- Keep price, order, payment and audit history immutable or append-only. Use database constraints for state invariants.
- Use integer minor currency units, explicit ISO currency, timezone-aware timestamps and strict JSON schema/version bounds.
- Add indexes for tenant + status + created time, foreign-key lookups, due follow-ups and provider event deduplication. Avoid indexing unnecessary PII.
- Migrations are additive, ordered, reversible where feasible and tested on ephemeral PostgreSQL plus local Supabase Auth/PostgREST with at least two users and two tenants.
- Do not apply a migration to hosted Supabase as part of documentation or PR review.

## 6. API contracts (proposed)

All browser calls use same-origin Next.js API routes. The exact path/method must be checked against current route handlers before implementation. Protected calls require a valid Supabase session; derive actor and tenant server-side. Use JSON, bounded payload sizes, schema versioning, `Cache-Control: no-store` for private data, correlation IDs and structured sanitized errors.

### 6.1 Common envelope

Request headers:
- `Authorization: Bearer <Supabase access token>` where the existing session transport requires it.
- `Content-Type: application/json`
- `Idempotency-Key: <opaque unique key>` for create/send/checkout/webhook-dispatch operations where documented.

Successful response envelope:
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "schema": "nova.marketing.response.v1",
    "correlationId": "uuid",
    "asOf": "2026-10-31T00:00:00Z"
  }
}
```

Error envelope:
```json
{
  "ok": false,
  "error": {
    "code": "approval_required",
    "message": "This action requires approval.",
    "retryable": false
  },
  "meta": {
    "schema": "nova.marketing.response.v1",
    "correlationId": "uuid"
  }
}
```

Do not return SQL errors, provider raw bodies, tokens, secret references with retrieval power, stack traces or internal route configuration.

### 6.2 Tenant context

| Method + path | Purpose | Contract |
|---|---|---|
| `GET /api/marketing/context` | Resolve current user's marketing tenant(s) | Server derives memberships and roles; client may select only among memberships returned to that session |
| `POST /api/marketing/organizations` | Create B2B organization tenant | Authenticated user becomes owner via server transaction; idempotent |
| `POST /api/marketing/organizations/:id/invitations` | Invite member | Owner/admin only; invitation token single-use, expiring and hashed at rest |

No API accepts an arbitrary `tenant_id` as proof of access. Tenant selection is a requested context and must be re-authorized on every call.

### 6.3 Catalog and package APIs

| Method + path | Purpose | Guard |
|---|---|---|
| `GET /api/marketing/products` | List tenant products | viewer+ |
| `POST /api/marketing/products` | Create product draft | admin/marketer |
| `PATCH /api/marketing/products/:id` | Edit draft product | admin/marketer; published references preserved |
| `GET /api/marketing/packages` | List packages and published versions | viewer+ |
| `POST /api/marketing/packages` | Create package draft | admin/marketer |
| `POST /api/marketing/packages/:id/versions` | Create immutable draft version | admin/marketer |
| `POST /api/marketing/packages/:id/publish` | Publish package version | approval required; exact version/hash |

AI package generation returns a draft schema only. Server validates product references, pricing, currency, entitlement limits, legal copy and margin policy. It cannot publish or change an active price.

### 6.4 CRM and lead APIs

| Method + path | Purpose | Guard |
|---|---|---|
| `GET /api/marketing/leads` | Paginated tenant lead list | sales+ |
| `POST /api/marketing/leads` | Create/import lead | consent/source validation; rate-limited |
| `GET /api/marketing/leads/:id` | Lead detail | assigned user or role policy |
| `PATCH /api/marketing/leads/:id` | Update lifecycle/assignment | role and transition checks |
| `POST /api/marketing/leads/:id/score` | Request bounded lead score | AI score is advisory and versioned |
| `POST /api/marketing/leads/:id/consents` | Record consent/withdrawal | immutable evidence; server timestamp |
| `POST /api/marketing/leads/:id/followups` | Schedule follow-up task | draft/schedule only; send gate still applies |

### 6.5 Campaign, offer and approval APIs

| Method + path | Purpose | Guard |
|---|---|---|
| `GET /api/marketing/campaigns` | List campaigns | viewer+ |
| `POST /api/marketing/campaigns` | Create campaign draft | marketer+ |
| `POST /api/marketing/campaigns/:id/generate` | Generate content draft | AI output schema + content safety checks |
| `POST /api/marketing/campaigns/:id/approval` | Submit immutable version for approval | marketer+; hash + policy version |
| `POST /api/marketing/approvals/:id/decision` | Approve/reject exact proposal | authorized approver; one-time transition |
| `POST /api/marketing/campaigns/:id/publish` | Publish approved version | approved exact hash; consent/policy recheck; provider allowlist |
| `POST /api/marketing/leads/:id/offers` | Create personalized offer draft | published package/price only |
| `POST /api/marketing/offers/:id/approval` | Request approval to send offer | discount and role policy |
| `POST /api/marketing/offers/:id/send` | Send approved offer | exact approval, consent and suppression recheck |

An approval decision does not itself call an external provider. A separate dispatcher loads the approved immutable action, revalidates current authorization/policy/consent, claims an idempotent outbox/action record, and performs the bounded provider call. If any content or audience field changes, require new approval.

### 6.6 Checkout, billing and entitlement APIs

| Method + path | Purpose | Guard |
|---|---|---|
| `POST /api/commerce/checkout-sessions` | Create hosted checkout session | published price version, buyer/tenant binding, idempotency |
| `GET /api/commerce/orders/:id` | Read own order | buyer or authorized tenant role |
| `POST /api/webhooks/payments/:provider` | Receive payment event | provider signature verification, timestamp/replay checks, event dedupe |
| `GET /api/commerce/subscriptions` | List subscriptions | own buyer/tenant |
| `POST /api/commerce/subscriptions/:id/cancel` | Request cancellation | owner/buyer policy; provider reconciliation |
| `GET /api/commerce/entitlements` | Read active entitlements | derived from verified state; never client-writable |
| `GET /api/commerce/usage` | Read quota usage | tenant scoped |

Payment integrations must use hosted checkout or provider tokenization. NOVA never handles raw card number, CVV or bank login. Webhooks are acknowledged only after signature validation and durable idempotent event capture; entitlement changes occur in a transaction/reconciliation workflow, not from browser redirects.

### 6.7 Channel and analytics APIs

| Method + path | Purpose | Guard |
|---|---|---|
| `GET /api/marketing/channels` | Show configured channel capabilities | tenant-scoped, secrets omitted |
| `POST /api/marketing/channels/:provider/connect` | Start official OAuth/consent flow | allowlisted provider, state/nonce/PKCE as supported |
| `POST /api/marketing/channels/:provider/callback` | Complete OAuth callback | one-time state, fixed redirect URI, server-side exchange |
| `POST /api/marketing/channels/:provider/test` | Verify connection/capabilities | bounded read-only provider operation |
| `GET /api/marketing/analytics/overview` | Tenant analytics summary | role + tenant scope |
| `GET /api/marketing/analytics/campaigns/:id` | Campaign performance | tenant-scoped, attribution caveats |

Social/ads APIs are not enabled merely by adding a channel name. Each provider requires official API review, permission scope inventory, token storage/revocation, rate limits, platform policy review, data retention and staging account tests.

### 6.8 Status and error semantics

Use stable machine-readable codes, including:
- `authentication_required` (401)
- `tenant_access_denied` (403 or non-enumerating 404)
- `role_insufficient` (403)
- `validation_failed` (400)
- `consent_required` / `recipient_suppressed` (409)
- `approval_required` / `approval_expired` / `approval_hash_mismatch` (409)
- `idempotency_conflict` (409)
- `entitlement_required` / `quota_exceeded` (402 or 429 according to documented product semantics)
- `provider_unavailable` (503)
- `rate_limited` (429)

Never expose whether a foreign tenant's lead, campaign, order or subscription exists.

## 7. Approval-gated automation policy

The selected operating mode is **approval required for consequential actions**.

| Action | AI may prepare | Human approval required | Execution after approval |
|---|---:|---:|---|
| Market/customer research | Yes | No, within data/privacy policy | Internal analysis only |
| Lead classification/scoring | Yes | No; advisory only | Store score + provenance |
| Product/package draft | Yes | Before publishing | Publish exact version |
| Price/discount proposal | Yes | Always | Apply exact approved version/policy |
| Website copy/landing page draft | Yes | Before publish | Publish approved version |
| Chat response to inbound request | Yes | Policy-dependent; no sensitive commitment | Reply only in authenticated session |
| Outbound social/email/DM campaign | Yes | Always | Send only to consented, non-suppressed audience |
| Social publishing | Yes | Always | Publish exact approved content/version |
| Ad campaign and targeting | Yes | Always | No spend until budget and audience approval |
| Ad budget change | Recommend only | Always, with explicit cap | Enforce provider and NOVA caps |
| Checkout/order creation | Prepare quote/session | Buyer confirmation | Hosted checkout |
| Refund/credit | Recommend only | Always | Authorized staff/provider workflow |
| Entitlement grant/revoke | No direct AI authority | Trusted billing reconciliation | Server-only transaction |

Approval record requirements:
- tenant, actor, role and authenticated owner binding;
- typed action kind and schema version;
- immutable canonical payload + SHA-256 hash;
- exact channel, audience/recipient count, creative version, package/price version and budget where relevant;
- policy version, expiry, approver, decision, timestamp and reason;
- one-time decision and replay denial;
- approval invalidated by any material payload or policy change;
- post-approval revalidation of role, consent, suppression, provider connection, price, budget and channel capability;
- durable outbox/action idempotency to prevent duplicate sends, publishes or spend.

Approval never overrides legal restrictions, provider terms, consent withdrawal, account suspension or security denial.

## 8. Security, privacy and abuse controls

### 8.1 Authentication and authorization

- Verify Supabase session server-side for every protected API call.
- Resolve tenant membership and role from database state on every request; do not trust client-side role claims alone.
- Enforce tenant composite foreign keys, RLS and server-side ownership checks.
- Use least-privilege role matrix: owner, admin, marketer, sales, analyst, viewer. Separate approver capability from content author where the organization policy requires four-eyes review.
- Require re-authentication or step-up confirmation for high-impact operations such as payment-provider changes, ad budget increases, refunds and owner/member changes.
- Rate-limit login-adjacent, lead capture, generation, send and webhook endpoints.

### 8.2 Consent, privacy and messaging

- Record purpose, channel, consent source, timestamp, policy version and withdrawal.
- Apply suppression and opt-out at send time; withdrawal takes effect immediately for future sends.
- No unsolicited bulk direct messages, scraped personal contact lists or purchased lists without documented lawful basis and provider-policy review.
- Provide data access, correction, export, deletion and retention workflows as legally required; preserve only legally required financial/audit records.
- Minimize PII in prompts. Prefer opaque lead IDs and only the fields needed for the specific generation task.
- Never send sensitive customer, broker or financial account data to ad platforms for audience targeting by default.
- Review applicable Thai PDPA, consumer protection, electronic transaction, tax, advertising and sector-specific rules with qualified counsel before launch. This architecture is not legal advice.

### 8.3 Secrets and provider integrations

- Store provider tokens only in the approved server-side secret vault after its access-path readiness gates pass. Until then, channel connection/write actions remain disabled.
- No secret in frontend env, browser storage, URL, prompt, AI context, MCP tool output, logs, traces, analytics, Git or issue text.
- Fixed provider host allowlists; no arbitrary URL fetch, redirect to private IP, user-supplied callback, dynamic module loading or unrestricted OAuth scopes.
- OAuth state/nonce and PKCE where supported; exact redirect URI; one-time callback; encrypted token references; revocation and rotation.
- Redact Authorization, cookies, OAuth codes, access/refresh tokens, payment payloads and personal identifiers from errors/logs.

### 8.4 AI and prompt-injection boundary

- AI output is untrusted input. Validate strict JSON schema, enum allowlists, size limits, URLs, HTML, claims and prohibited content.
- Do not let retrieved website/social content override system policy or authorize tools.
- Use allowlisted tools with typed arguments; no arbitrary shell, SQL, HTTP fetch or provider method selection.
- AI cannot approve its own proposal, change its role, create consent, mark payment successful or override pricing/budget policy.
- Preserve source/provenance for research claims; label generated marketing claims and require substantiation for factual, financial, health or performance claims.
- Include human review for regulated/high-impact claims and channel-specific policies.

### 8.5 Payment and financial integrity

- Hosted checkout/tokenization only; no PAN/CVV storage.
- Verify webhook signatures, provider timestamp tolerance, event ID uniqueness and replay.
- Reconcile provider state before issuing/refunding entitlement.
- Keep append-only payment event evidence; separate payment state from entitlement state.
- Use integer minor currency units and explicit currency/tax behavior.
- Refund, chargeback, cancellation and failed-renewal transitions must be tested.
- Do not treat a success redirect or client request as proof of payment.

### 8.6 Observability and incident response

- Generate correlation IDs and append sanitized audit events for create/edit/approve/publish/send/spend/payment/entitlement/member/consent changes.
- Monitor denied cross-tenant requests, webhook signature failures, duplicate events, unexpected send volume, ad spend drift, provider token failures and elevated error rates.
- Define kill switches per channel/provider and per tenant. Kill switch disables new outbound actions without deleting evidence.
- Support idempotent retries, dead-letter/manual recovery and provider reconciliation.
- Define retention, backup/restore, incident response and breach-notification procedures before launch.

## 9. Analytics and learning loop

Measure the complete funnel with tenant-scoped events and versioned definitions:

- Acquisition: impressions, clicks, landing visits, source attribution, cost per lead.
- Activation: signup, verified profile, first meaningful product action.
- Qualification: lead score, response time, qualified rate, consent state.
- Sales: offer rate, offer acceptance, checkout start, paid conversion, average order value.
- Subscription: MRR/ARR, renewal, failed payment recovery, churn, expansion.
- Unit economics: CAC, cost per lead, AI cost per completed task, channel cost, payment fees, support cost, gross/contribution margin.
- Retention: active users, repeat purchase, usage cohort, renewal and opt-out.
- Trust: complaint, unsubscribe, refund, chargeback, consent withdrawal and policy-denial rates.

Every metric must document event source, formula, time window, attribution model, missing-data behavior and whether values are observed or estimated. AI may recommend experiments and budget reallocations; it cannot change live spend without a fresh approval. Start with descriptive analytics, then offline evaluation; no unreviewed self-optimization against live audiences.

## 10. Implementation backlog and gates

This is the implementation backlog for the existing NOVA workstream, not a new master tracker. Link work to the existing commercial model Issue #80 and preserve dependencies on Issues #78/#82 and the existing delivery verification plan. Do not create a duplicate tracker or automation.

| Wave | Work item | Dependencies | Acceptance gate |
|---|---|---|---|
| W0 — Source audit | Re-read current main, all Supabase migrations, RLS/grants/RPCs, frontend routes, System Hub boundaries, open PRs #67/#79/#81/#89/#101 and deployment plan | Current exact main SHA | Path/table/API inventory; overlap and dependency map; no duplicate service |
| W1 — Tenant foundation | Define personal/org tenant bootstrap, memberships, role matrix, composite FKs and RLS | Auth + existing RLS review | Two users/two organizations; owner/member/viewer allow-deny tests; no cross-tenant reads/writes |
| W2 — Catalog & packages | Product, package version, price version, entitlement schemas and deterministic pricing validator | W1; commercial assumptions in #80/#81 | Immutable published versions; currency/tax/discount boundary tests; AI cannot publish |
| W3 — CRM & consent | Leads, customer profile minimization, consent evidence, suppression, assignment and follow-up task contracts | W1; legal/privacy review | Consent withdrawal blocks send; tenant-safe dedupe; PII redaction and retention tests |
| W4 — AI marketing drafts | Structured campaign/content/offer generation through existing NOVA AI Worker | W2/W3; prompt-injection controls | Schema-valid drafts, provenance, no publish/send/budget side effects |
| W5 — Approval extension | Add typed marketing approval request kinds to existing PR #67 lifecycle | W4; exact review of current approval SQL/API | Immutable payload hash, expiry, policy version, role checks, replay denial, two-person policy where required |
| W6 — First-party channels | Website campaign/landing content and inbound NOVA chat lead capture | W2–W5 | Preview/publish approval, analytics provenance, safe rollback |
| W7 — External channels | Official social/ads OAuth adapters, consent-aware audience selection, provider capabilities | W5; approved vault path; provider legal/terms review | Provider staging account; exact approved content/audience; duplicate-send prevention; revoke test |
| W8 — Commerce | Hosted checkout, orders, signed webhooks, subscription, usage and entitlements | W1/W2; provider selection; tax/legal review | Local/isolated end-to-end checkout, webhook replay/signature failures, refund/cancel/reconciliation, entitlement isolation |
| W9 — Analytics & learning | Funnel, attribution, cohort, unit economics and offline experiment evaluation | W3–W8 | Reproducible metric definitions, observed-vs-estimated labels, tenant-safe analytics |
| W10 — Controlled beta | Limited tenant cohort and operational readiness | All applicable security, legal, provider and delivery gates | Explicit owner approval, support/rollback plan, exact deploy SHA, monitoring and post-deploy verification |

### Suggested PR sequence

1. **Architecture PR (this document):** docs only; no migrations, application code, provider settings or deployment.
2. **Tenant/schema design review:** additive migration proposal and RLS/grant matrix only after W0 source audit.
3. **Catalog/package contracts:** schema validators and deterministic unit tests; no checkout.
4. **CRM/consent contracts:** lead lifecycle, consent and suppression tests; no outbound channel writes.
5. **Approval extension:** reuse PR #67's durable lifecycle; exact-head migration/API/two-tenant tests.
6. **First-party draft/publish workflow:** website/chat only, preview-first and approval-gated.
7. **Provider/payment adapters:** one provider at a time, staging credentials only, explicit capability scopes.
8. **Beta:** separate explicit production authorization; never infer permission from architecture approval or CI.

## 11. Definition of done

The Marketing & Sales Engine is not complete until all applicable criteria pass with inspectable evidence:

- [ ] Exact current main SHA and repository path inventory recorded before each implementation.
- [ ] No duplicate frontend, CRM gateway, AI gateway, System Hub, approval engine or secret store.
- [ ] Personal and organization tenant model, role matrix, RLS and composite tenant references pass two-user/two-tenant tests.
- [ ] Published package/price versions are immutable; orders retain purchase-time snapshots.
- [ ] AI output is schema-validated and draft-only.
- [ ] Approval extension is owner/tenant/role-bound, immutable, expiring, single-use and replay-safe.
- [ ] Consent and suppression are rechecked immediately before every outbound message.
- [ ] Social/ads provider scopes, official API terms, token vault, revocation and staging tests pass.
- [ ] Hosted checkout, signed webhook verification, idempotency, reconciliation, refund/cancel and entitlement tests pass.
- [ ] Analytics definitions are reproducible and distinguish observed data from estimates.
- [ ] Thai legal/compliance, privacy, tax, provider terms and customer disclosures are reviewed before launch.
- [ ] Exact-head CI passes; relevant staging/runtime evidence and rollback are recorded.
- [ ] Explicit owner approval exists before any production channel publishing, paid checkout or advertising spend.
- [ ] Existing NOVA safety invariants remain unchanged: broker reads remain read-only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

## 12. Open decisions before implementation

The architecture can be reviewed now. These decisions must be settled before the relevant implementation wave:

1. Initial tenant bootstrap and B2B organization invitation/verification rules.
2. First launch vertical and jurisdiction; "all markets" is a schema/product extensibility decision, not blanket legal or provider availability.
3. Payment provider and supported payment rails/currencies, selected only after fee, settlement, refund, tax and webhook review.
4. Social/advertising providers and exact OAuth scopes; do not assume Meta, TikTok, Google or any other platform is enabled.
5. Data retention periods and lawful basis by data class and channel.
6. Discount authority, minimum contribution margin, maximum ad budget and approver separation.
7. Whether outbound email/SMS is in a later channel phase; it is not included in the user's currently selected initial channel set.
8. Operational ownership for support, incident response, payment reconciliation and legal review.

## 13. Change log

- 2026-10-31: Initial architecture proposal based on verified canonical main SHA `a2acfd8ec9b598e6593413549bef760e8f596a72`. No runtime implementation or production activation performed.
