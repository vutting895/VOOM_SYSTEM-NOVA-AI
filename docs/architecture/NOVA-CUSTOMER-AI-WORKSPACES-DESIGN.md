# NOVA Customer AI Workspaces — Product and Technical Design

- Status: design baseline; implementation not yet complete
- Tracking: GitHub Issue #82
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base branch: `main`
- Safety baseline: read-only + AI analysis / paper research; broker order submission disabled; Live Trading OFF

## 1. Product outcome

NOVA becomes a multi-tenant platform where a customer can select an approved strategy template (for example, Strategy 001), press **Run**, and receive a persistent, customer-owned workspace. The workspace is composed from a versioned, validated UI manifest and contains only data and capabilities authorized for that customer.

The workspace is not a separate application or a copied site. It is a route/shell within the canonical `frontend/` application, protected by the existing Supabase Auth session and NOVA server-side authorization.

## 2. Customer journey

1. Customer signs in to NOVA.
2. Customer reviews an approved strategy template, its status, required data, risk limits, and current capability (research, paper, or read-only monitoring).
3. Customer presses **Run**.
4. The server validates the user's session, entitlement, template version, strategy eligibility, data readiness, risk policy, and idempotency key.
5. If legal/policy consent is missing or stale, NOVA presents the current versioned notices and blocks activation until affirmative consent is recorded.
6. NOVA creates a workspace and strategy instance owned by the authenticated user/tenant. The UI loads a fixed, allowlisted component manifest.
7. Customer connects their own supported broker account through a server-side, tenant-scoped connection flow. Initial broker target is Exness Demo through the existing MT5 read-only proxy/bridge.
8. Customer uses their Personal AI assistant within the workspace. The assistant can explain that customer's authorized strategy and data, but cannot access other tenants or override NOVA platform controls.

### Meaning of "Run" in the first release

"Run" means instantiate the approved strategy workspace and start only permitted research/paper/read-only monitoring tasks. It does **not** mean place, modify, or cancel broker orders. If a strategy cannot be safely started due to missing consent, missing data, failed risk checks, unavailable broker allocation, or unavailable provider, the server returns an explicit blocked/unavailable state.

## 3. AI responsibility separation

### NOVA Central AI

- Shared platform-level research and analysis capabilities.
- Maintains centrally managed strategy templates, policy versions, component catalog, and model/provider configuration.
- Does not receive tenant data by default.
- Cannot grant access or change tenant ownership.

### Customer Personal AI

- Separate assistant identity, thread namespace, and memory scope for each user + tenant + workspace.
- Receives only minimum, redacted, authorized context for the active workspace.
- Uses server-side data tools that re-check the authenticated owner and connection permissions on every call.
- Cannot access other users' threads, broker secrets, credentials, or private workspaces.
- Cannot change central NOVA policy, risk hard limits, entitlements, or execution capabilities.
- If model/provider is unavailable, returns an explicit unavailable response; no fabricated account status, quotes, or analysis.

Thread and checkpoint keys must be derived server-side from the authenticated identity and workspace. Never accept a client/model-supplied thread owner or tenant as authorization.

## 4. Dynamic workspace generation

Use a data-only manifest with a schema version, workspace template ID/version, and a list of component descriptors. Render through a fixed React component registry already shipped with the application.

Initial component types may include:
- strategy_status
- market_summary
- price_chart
- account_summary (only after verified owner-scoped broker reads)
- risk_summary
- backtest_summary
- activity_feed
- personal_ai_panel
- broker_connection_status
- consent_notice

Every component has strict per-type props, bounds, and data-source permissions. Reject unknown component types, unknown/unsafe props, arbitrary URLs, HTML, JavaScript, iframe injection, and model-authored code. The model may suggest a layout only as structured JSON; the server validates and persists the final manifest. The frontend must never eval or execute generated content.

## 5. Tenant and data model

Proposed logical records (final names and migrations must be reconciled with existing schema before implementation):

| Record | Purpose | Ownership |
|---|---|---|
| workspaces | Customer workspace metadata and manifest version | user/tenant |
| strategy_instances | Template version, parameters, lifecycle and status | workspace owner |
| personal_ai_threads | Assistant thread metadata and retention state | user + workspace |
| personal_ai_messages | Optional persisted messages after privacy/retention review | thread owner |
| policy_documents | Versioned ToS, Privacy Notice, risk and broker disclosures | platform-managed |
| policy_consents | User acceptance, policy version, timestamp, locale and evidence | user |
| broker_connections | Provider, environment, safe display metadata, status, secret reference | user/tenant |
| audit_events | Sanitized security and lifecycle events | user/tenant + platform |

Before adding migrations, inspect current migrations and tables to reuse or extend existing records where possible. Do not create duplicate tables for an existing concept. Every tenant-owned record requires RLS and least-privilege grants; service-role access must remain server-only.

## 6. Broker credentials and connection security

- First release: Exness Demo via existing MT5 read-only proxy/bridge only.
- Use an approved server-side secret store/vault. Use envelope encryption with a managed key/KMS where supported; define rotation, revocation, access audit, retention, and incident response.
- Store only non-secret connection metadata and an opaque server-only secret reference in Postgres.
- Never place broker passwords/API secrets in normal database columns, browser storage, client props, chat prompts, model context, audit payloads, logs, URLs, or checkpoints.
- The broker connection flow must not ask users to paste passwords into Personal AI chat.
- Every request resolves the current user's connection ownership and tenant route server-side. Never trust client-supplied user_id, tenant_id, connection_id, route name, or upstream URL.
- No shared tenant token or default route. Missing tenant Bridge allocation fails closed.
- Disconnect/revoke must invalidate the secret reference/route authorization and create a sanitized audit event.
- Report connection readiness precisely: not_configured, configured, reachable, authenticated, data_verified, degraded, unavailable. Configuration alone is not a connected account.

## 7. Consent, legal notices, and customer rights

Before a workspace or broker connection is activated, show the applicable, versioned documents:
- Terms of Service
- Privacy Notice / Personal Data Processing Notice
- Risk disclosure (research/paper trading, no guarantee of performance, limitations of backtests)
- Broker and market-data provider disclosures
- AI disclosure (what Personal AI can access, model/provider processing, retention)
- Any jurisdiction- and product-specific notices identified by qualified counsel

Consent must be an affirmative action, recorded with document ID/version, user ID, timestamp, locale, and a minimal audit reference. A new material policy version may require re-consent before affected functionality resumes. Provide access to current notices and user-facing disconnect/revoke and applicable data access/export/deletion request workflows.

Displaying notices does not itself establish legal compliance. Qualified legal review must determine applicable laws, controller/processor roles, lawful basis/consent requirements, cross-border transfers, retention, financial-services licensing/disclosures, and broker/data-provider terms for each operating jurisdiction. Do not claim that NOVA is compliant until that review and operational controls are complete.

## 8. Server-side lifecycle and capability gates

Suggested strategy instance states:
- draft
- awaiting_consent
- validating
- blocked
- ready
- paper_running
- paused
- completed
- failed
- revoked

All transitions are server-owned and audited. Validate entitlement, template allowlist, parameter schema, data freshness, risk policy, consent version, provider readiness, and tenant ownership before moving to ready/paper_running.

Capability flags are enforced on the server, not just hidden in UI:
- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`

There must be no broker order tools or order endpoints in this release. UI buttons are not a security boundary.

## 9. API contract sketch

Potential same-origin authenticated endpoints (names are provisional; reconcile with existing API routes and Hub before coding):
- `POST /api/workspaces` — create workspace from an approved template; require idempotency key.
- `GET /api/workspaces` — list only the authenticated user's workspaces.
- `GET /api/workspaces/:workspaceId` — owner-scoped workspace and validated manifest.
- `POST /api/workspaces/:workspaceId/strategy/run` — validate and start permitted paper/research lifecycle.
- `POST /api/workspaces/:workspaceId/strategy/pause` — pause allowed background research/paper task.
- `GET /api/workspaces/:workspaceId/assistant/threads` — list owner-scoped Personal AI threads.
- `POST /api/workspaces/:workspaceId/assistant/messages` — authenticated, bounded, redacted Personal AI request.
- `POST /api/policy-consents` — record affirmative acceptance of exact current document versions.
- Broker connection requests and status must reuse the System Integration Hub contract; do not create a parallel arbitrary proxy.

All routes verify Supabase session server-side and derive owner/tenant from the verified identity. Return 401 for missing/invalid sessions, 503 if authentication cannot be verified safely, and non-enumerating 404/403 for foreign resources according to the established policy.

## 10. Delivery and verification

### Phase A — Inventory
- Inspect current main branch, routes, schema/migrations, Auth/RLS, strategy lifecycle, AI chat, Hub, MT5 proxy/bridge, CI and deployment configuration.
- Map existing records and APIs before deciding new tables or endpoints.
- Preserve existing files and user data.

### Phase B — Contracts and migrations
- Define Zod/JSON schemas for workspace manifest, strategy instance, Personal AI scope, consent and broker metadata.
- Review SQL migrations, RLS policies, grants, and service-only access.
- Add migrations only after review and with rollback/forward compatibility plan.

### Phase C — MVP
- Create workspace from an approved strategy template.
- Render a tenant-specific dashboard from the validated manifest.
- Add isolated Personal AI threads with minimum scoped context.
- Add broker connection request/status via existing Hub and Exness Demo read-only path.
- Add versioned notice and consent gate.

### Phase D — Security and quality
- Two-user/two-tenant positive and negative tests for every resource.
- Missing/expired token, auth outage, RLS, foreign ID, replay/idempotency, rate-limit, prompt injection, data leakage, secret redaction, revoke/disconnect and stale consent tests.
- Reject unsafe manifest components and props.
- Assert no broker order route/tool exists and capability flags remain false.
- Frontend typecheck/build, Worker tests, migration tests and secret scan.

### Phase E — Staging
- Use synthetic test identities and synthetic broker fixtures only.
- Verify the exact Preview commit and deployment.
- Verify Exness Demo only after dedicated tenant Bridge allocation; a mock test is not live broker evidence.
- Capture test run URLs, commit SHA, deployment ID and sanitized runtime evidence.

### Phase F — Production
- Requires reviewed PR, passing CI, security review, legal review, staging evidence, and explicit production activation approval.
- Do not alter DNS/provider settings or enable live trading as part of this feature by implication.

## 11. Acceptance criteria

1. Two test users can each create/read/update their own workspace; neither can access the other's workspace, strategy instance, Personal AI thread, consent, broker metadata or connection.
2. Pressing Run creates one persistent owner-bound workspace/strategy instance for an approved template; duplicate requests are safely deduplicated.
3. Personal AI is scoped to one customer/workspace, uses only authorized redacted context, and fails honestly when the provider is unavailable.
4. Dynamic UI is rendered only from validated allowlisted components; no arbitrary HTML/JS or unrestricted URLs.
5. Broker secrets never reach the browser/model/logs or plaintext application tables; disconnect/revoke removes access.
6. Workspace activation is blocked until affirmative consent for all required current policy versions is recorded.
7. Read-only/paper-only capability is enforced server-side; no order endpoints/tools; Live Trading OFF.
8. All tests, builds, migrations, preview deployment and runtime claims are evidenced against exact commit/deployment. Unverified items remain open.

## 12. Current repository constraints

The existing `frontend/app/gen-ai/page.jsx` creates a strategy draft; it does not yet create a persistent customer workspace. The existing unified frontend direction and System Integration Hub design should be extended, not replaced. The current research notes already require data-only allowlisted UI, server-owned tenant routing, RLS, secret references, and no broker write tools. Durable Personal AI memory/thread isolation and production Exness account verification must be implemented and tested before being described as available.
