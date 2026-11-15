# NOVA Customer Support Center — system design

**Status:** Design proposal; implementation has not started  
**Baseline:** a2acfd8ec9b598e6593413549bef760e8f596a72
**Tracking:** Issue #119; master delivery tracker #36  
**Canonical delivery gates:** docs/NOVA-DELIVERY-VERIFICATION-ACTIVATION-PLAN.md

## 1. Product objective

Deliver a dependable, tenant-safe support experience inside the existing NOVA customer application. Customers should be able to find approved help content, ask the NOVA support assistant, open and track a case, and hand off to a human. Support staff need a separate protected work queue with assignment, priorities, service targets and an auditable case history.

The product must reuse the current customer identity, frontend shell, authenticated application API and AI boundary. It must not create a second customer dashboard, parallel login system, duplicate general-purpose AI chat, or alternate broker gateway.

## 2. Repository findings and integration decisions

Inspected on main at the baseline above:

- The customer workspace is already implemented in frontend/app/command-center/page.jsx. Its implementation tracker is docs/NOVA-CUSTOMER-COMMAND-CENTER-IMPLEMENTATION.md.
- The customer AI route is frontend/app/api/chat/route.js. It verifies the Supabase bearer session with auth.getUser before reading the request body, bounds conversation size, redacts credential-like values before forwarding to the NOVA AI Worker and validates the fixed intent envelope before returning it to the browser.
- Owner-scoped durable assistant threads and review approvals exist in the 202610300001_nova_durable_approval_lifecycle migration and frontend/app/api/agent/threads/route.js. These represent AI review workflows, not support cases. Do not store support tickets as agent approvals or repurpose the agent thread tables.
- The customer command-center tracker explicitly states that chat remains request/response, history is not a general-purpose durable conversation store, and streaming / graph interrupt-resume is not established.
- No dedicated support ticket, support message or support staff membership implementation was found in the inspected main paths.
- PR #116 (AI provider adapters) is an open draft at this baseline. Do not depend on it or copy its code until it is merged and its exact main-branch capability is verified.
- The delivery plan records outstanding Supabase migration-baseline and staging acceptance work. Do not apply a new support migration to production or create production test users as part of this design phase.

### Integration map

| Concern | Reuse | New support-owned capability |
|---|---|---|
| Customer identity | Existing Supabase Auth session and server-side auth.getUser validation | Case owner is derived from the verified session, never request JSON |
| Customer UI | Existing NOVA Command Center and navigation conventions | Support workspace and case detail views |
| AI | Existing authenticated NOVA AI route / Worker boundary on main | Support-specific system policy, approved KB retrieval and handoff decision |
| Durable workflow | Existing NOVA agent thread/approval code as a pattern only | Support cases, messages, events and staff assignment |
| Authorization | Supabase RLS and server-side owner checks | Trusted support staff authorization and visibility rules |
| Operations | Existing Cloudflare Workers / current notification direction | SLA calculation, queue metrics and support alerts |

## 3. Roles and authorization

### Customer

- May create cases for their own authenticated identity.
- May list and read only their own cases.
- May read and write customer-visible messages on their own cases, subject to case state.
- May not see internal notes, staff-only events, staff identities beyond the display name needed for the reply, or another customer's records.
- Cannot set owner ID, staff assignment, priority override, SLA deadlines, internal visibility or resolved-by identity.

### Support agent

- Has a server-managed active staff membership and an explicit role.
- May read assigned cases and claim eligible unassigned cases according to queue policy.
- May add customer-visible replies and private internal notes.
- May move cases only through allowed state transitions.
- Cannot manage staff membership or global SLA policy unless separately granted.

### Support lead / administrator

- May access the team queue, reassign cases, manage categories and approved response templates, and review support metrics.
- Staff membership changes and privileged operations are always server-authorized and audited.
- A browser role, user-editable profile field, model output or client-supplied JWT metadata must not grant staff access.

### Authorization design

- Customer API requests authenticate before parsing protected request bodies and derive the owner from the verified Supabase user.
- Customer reads use a user-scoped Supabase client so RLS remains active.
- Staff API routes call a shared server-only authorization function on every request. It checks an active row in a private, server-managed staff membership store before any privileged read or write.
- If a server-only elevated database credential is required for staff operations, it remains in a backend secret store, never in NEXT_PUBLIC variables, browser bundles, prompts, URLs or logs. Service-role access bypasses RLS, so the API must complete the staff check and case-scope check before using it.
- Denials fail closed. Missing membership, inactive membership, unknown roles, stale sessions or unavailable authorization services do not fall back to customer access.

## 4. Customer and staff UX

### Customer workspace

Keep the current Command Center as the primary customer shell. Add a Help & Support entry point and a focused support area rather than a duplicate dashboard.

Proposed routes:
- /support — support overview, approved knowledge search, AI support entry and the customer's recent/open cases.
- /support/cases/[caseId] — customer-visible case conversation, status timeline and reply composer.
- A support drawer may be opened from the Command Center to preserve context; the full case view remains linkable and refresh-safe.

The customer sees:
- Search help articles and FAQs before creating a case.
- Ask NOVA Support, with clear disclosure when a response is AI-generated.
- Ask for a human at any point.
- Create a case with category, subject, description and optional diagnostic consent.
- See case number, current status, priority label where appropriate, last response and next expected update.
- Reply, reopen a resolved case during the configured reopen window and rate the completed interaction.

Do not show internal notes, hidden risk scores, raw stack traces, provider names, credentials, private broker data or staff-only events.

### Staff console

Proposed route: /staff/support.

Core views:
- Queue: unassigned, mine, waiting for customer, waiting for support, breached / at-risk SLA and recently resolved.
- Case detail: conversation timeline, customer-safe account context, priority, assignment, category, SLA clock and audit timeline.
- Actions: claim, assign, reassign (lead only), send public reply, add internal note, set allowed status, request information and resolve.
- Filters: priority, category, age, status and assignment.

The queue must not expose full customer broker records. A staff member may see only the minimum diagnostic state approved for support, with explicit provenance and freshness. Any deeper account investigation must use an existing owner-scoped System Hub path and its access controls, never a direct database shortcut.

## 5. Case lifecycle and priority

### Lifecycle

~~~text
NEW -> OPEN -> WAITING_FOR_CUSTOMER -> OPEN -> RESOLVED -> CLOSED
                         ^                |
                         |                +---- customer reopens within policy
                         +--------------------- new customer reply
~~~

Rules:
- NEW is created by a customer or the approved support intake service.
- OPEN means support owns the next action.
- WAITING_FOR_CUSTOMER pauses the customer-response portion of the SLA clock.
- A customer reply moves WAITING_FOR_CUSTOMER to OPEN.
- RESOLVED records the proposed solution and the resolving staff identity.
- CLOSED is terminal for ordinary replies; reopen creates a new active lifecycle on the same case only within configured policy, otherwise a linked follow-up case is created.
- Every state transition is validated server-side and appended to the immutable event history.
- AI does not resolve security, access, billing or broker-related cases on its own.

### Priority proposal

| Priority | Typical example | Proposed first-response target |
|---|---|---|
| P0 — Critical | Suspected account takeover, active privacy/security incident | 15 minutes |
| P1 — High | Customer cannot sign in or a core service is unavailable | 1 hour |
| P2 — Normal | Verified broker connection issue, incorrect status, data question | 1 business day |
| P3 — Low | How-to question, feature request or general feedback | 2 business days |

These are initial design targets, not a service promise. They must not be advertised until support coverage, staffing, holidays, timezone and escalation ownership have been approved. Persist all times in UTC and render in the customer's configured timezone; the initial default may be Asia/Bangkok. Pause or adjust deadlines only under a versioned SLA policy. Customer-waiting time must be distinguishable from support-working time.

### Sensitive case handling

Suspected compromise, data exposure, unauthorized access, privacy requests and security reports bypass AI-only resolution and go to a restricted human queue. Broker connectivity or trading questions are handled as read-only support. VOOM support cannot place, cancel, close or modify broker orders.

## 6. Data model proposal

The first schema should be deliberately small. Do not add a speculative organizations table until the canonical workspace/organization ownership model is present on main.

### support_cases

- id: opaque UUID primary key; never use the case number as an authorization token.
- case_number: server-generated, human-readable reference with a uniqueness constraint.
- customer_user_id: required FK to auth.users; populated from verified identity only.
- subject: bounded text.
- category: strict allow-listed enum / lookup value.
- priority: P0 through P3, with customer submissions defaulting to P2/P3; only authorized policy or staff logic may raise/lower it.
- status: strict lifecycle enum.
- assigned_staff_user_id: nullable FK to trusted staff identity.
- source: web, AI handoff or approved integration.
- first_response_due_at, resolution_due_at, first_response_at, resolved_at, closed_at.
- created_at, updated_at, last_customer_message_at, last_staff_message_at.
- SLA policy version and reopen metadata.

### support_messages

- id, case_id, created_at.
- author_kind: customer, staff, assistant or system.
- author_user_id: nullable where the event is system-generated.
- visibility: customer or internal.
- body: bounded plain text / constrained markdown; no HTML rendering.
- client_idempotency_key: scoped to the authenticated author and case.
- assistant provenance fields only where useful: model/provider identifier and approved source IDs; never store credentials or hidden model prompts.

Customer message queries must filter by case owner and customer visibility in the database. The customer API must not fetch all messages and filter internal notes in application memory.

### support_events

- Append-only event records for case creation, assignment, priority change, status transition, staff reply, customer reply, internal note, SLA breach, reopen and resolution.
- Actor type and actor ID, event type, created_at, correlation ID and minimal allow-listed metadata.
- No raw access tokens, provider credentials, broker passwords, full private account payloads or unrestricted JSON blobs.

### support_staff_memberships

- Stored in a non-public/private schema or equivalent server-only store.
- staff_user_id, role, active, created_at, updated_at and grant provenance.
- Not writable or readable by ordinary authenticated customer clients.
- Changes require a trusted admin operation and an audit event.

### Later tables

- support_articles: published, versioned, source-linked knowledge articles with owner/editor and publication state.
- support_sla_policies: effective-dated business hours, holidays, target durations, pause rules and escalation routes.
- support_feedback: one response per eligible resolved case with bounded score and optional comment.

Use explicit database constraints, indexes on owner/status/update time and assignment/status/update time, and foreign keys that preserve case ownership integrity. Avoid unnecessary indexes until query patterns are measured.

## 7. API contract proposal

All endpoints are same-origin Next.js server routes, private by default, no-store and bounded.

| Endpoint | Purpose | Authorization |
|---|---|---|
| POST /api/support/cases | Create case | Authenticated customer; server sets owner |
| GET /api/support/cases | List current customer's cases | Authenticated customer + owner filter |
| GET /api/support/cases/[id] | Read case and public timeline | Authenticated customer + owner filter |
| POST /api/support/cases/[id]/messages | Add customer reply | Authenticated owner + state validation |
| POST /api/support/cases/[id]/reopen | Reopen eligible case | Authenticated owner + reopen policy |
| POST /api/support/assistant | Grounded support answer / case handoff | Authenticated customer; owner context derived server-side |
| GET /api/staff/support/queue | Staff queue | Active staff membership + queue scope |
| GET /api/staff/support/cases/[id] | Staff case detail incl. permitted internal notes | Active staff membership + case assignment/team scope |
| POST /api/staff/support/cases/[id]/reply | Public staff response | Active staff membership |
| POST /api/staff/support/cases/[id]/notes | Internal note | Active staff membership |
| PATCH /api/staff/support/cases/[id] | Assignment / allowed state / priority update | Active role + transition authorization |

Do not use a generic PATCH that accepts arbitrary database columns. Each action has its own strict schema and allowable transition. Staff writes should update the case and append the audit event atomically, preferably through a narrowly granted database function/RPC with explicit arguments.

## 8. AI support policy

### Allowed actions

- Search a versioned, approved Knowledge Base.
- Explain documented product behavior and safe troubleshooting steps.
- Ask bounded follow-up questions.
- Classify category and suggest priority for human review.
- Summarize a case for the next staff member.
- Draft a response for staff approval.
- Create a case only after clear customer intent/consent or explicit human handoff.

### Disallowed actions

- Change customer authentication, roles, access grants or tenant ownership.
- Create or reveal staff memberships, internal notes or another customer's records.
- Read broker credentials, Vault contents or unrestricted account data.
- Directly provision, disconnect or modify broker links.
- Place, cancel, close or modify orders, or enable execution/live trading.
- Treat customer text, retrieved documents or an AI message as authorization policy.
- Mark a sensitive case resolved solely from a model response.

### Grounding and handoff

- Retrieval is limited to published support articles and owner-scoped diagnostic facts approved for that case.
- The answer includes article titles / links or states that no approved source was found.
- Missing evidence, conflicting sources, repeated failed troubleshooting, explicit human request, security/privacy topic or any request to change account/broker state causes handoff.
- Do not rely only on an LLM self-reported confidence score. Apply deterministic policy checks around source coverage, category and action type.
- Keep the support assistant's prompt separate from the general Personal AI prompt, but reuse the same verified provider boundary. Never create a second provider integration.
- AI content is stored as an assistant message only after validation and redaction. User-facing output must not contain secret or internal-only fields.

## 9. Knowledge Base

Initial sources should be maintained as reviewed, version-controlled product documentation. Publish only articles with:
- stable article ID and version,
- title, product area, supported version and last-reviewed date,
- explicit applicability / exclusions,
- step-by-step customer-safe instructions,
- source links and owner,
- publication state and retirement history.

Do not ingest private repo issues, secrets, customer records, internal staff notes or drafts into customer-facing search. A separate internal-only article collection may be added later with server-side staff checks and a distinct retrieval policy.

## 10. Notifications and SLA operations

MVP notification channel: in-app notification center and case timeline. Email delivery is a later adapter after the provider, consent, templates and suppression behavior are selected. Do not add Telegram notifications.

Notification events:
- case created / reference issued,
- support reply received,
- staff requested more information,
- case resolved,
- SLA approaching / breached (staff-facing),
- case reopened.

Notifications should be idempotent, deduplicated and user-scoped. Keep notification payloads minimal; link back to the authenticated case page instead of embedding private case content in push/email.

SLA processing should use a versioned policy and reliable scheduled execution. Do not imply a Cron/Scheduler capability is deployed until the chosen provider path is verified. Record delivery attempts and failures; retries must not generate duplicate messages or case transitions.

## 11. Security, privacy and abuse controls

- RLS for customer cases and messages; direct customer access to internal messages/events is denied.
- Staff membership is checked server-side on every privileged API operation.
- Every privileged case operation checks staff role, assignment/team scope, allowed transition and case existence.
- Keep elevated DB keys server-only; never send them to the browser or AI provider.
- Validate content size, encoding, enum values, allowed markdown and idempotency keys. Rate-limit case creation and posting.
- Protect against prompt injection by treating case text and knowledge content as untrusted data, using retrieval allowlists, strict output schemas and deterministic authorization.
- Minimize logs and redact secrets/PII. Use correlation IDs rather than account or credential values.
- MVP excludes attachments. Later attachment support requires a private bucket, file type/size allowlist, content scanning, safe download headers, short-lived owner/staff signed URLs, retention controls and audit events.
- Define retention, deletion/export handling and privacy-request workflow before launch.

## 12. Support analytics

Staff / admin metrics:
- open backlog by priority and age,
- first response time and time to resolution,
- SLA at-risk / breached count,
- reopen rate,
- first-contact resolution,
- handoff rate and AI deflection rate,
- customer satisfaction score,
- top categories and recurring issue trends.

Metrics must aggregate without exposing message text or private account details. Distinguish AI answer views from confirmed successful resolutions; do not optimize for deflection alone.

## 13. Delivery plan

### Phase 0 — design and baseline (current)

- Complete this architecture / data / UX proposal.
- Review current main migration baseline and staging availability.
- Select staff identity provisioning and role ownership.
- Approve support hours, SLA targets, retention and notification policy.
- Keep this phase documentation-only.

### Phase 1 — ticket MVP

- Create support case, message, event and staff membership schema via a reviewed migration.
- Implement authenticated customer case list/detail/create/reply.
- Implement protected staff queue, assignment, public reply and internal note.
- Add state-transition and atomic audit event functions.
- Test two customers, one staff user, one inactive/non-staff user and cross-case denial in isolated staging.
- Do not release until internal-note secrecy and staff authorization tests pass.

### Phase 2 — AI support and Knowledge Base

- Add published, source-versioned article retrieval.
- Add the support-specific assistant policy via the current main provider boundary.
- Add handoff to a durable case and staff summary.
- Test prompt injection, no-source cases, sensitive topics, explicit human requests, refusal to perform broker writes and leak prevention.
- Do not let AI resolve sensitive or access-control cases.

### Phase 3 — SLA, alerts and analytics

- Configure support business hours and approved target times.
- Add scheduled at-risk / breached SLA processing and idempotent in-app alerts.
- Add staff workload, queue age and customer satisfaction reporting.
- Verify timezone boundaries, weekends/holidays, waiting-customer pauses and retry behavior.

### Phase 4 — attachments and external channels

- Add secure file handling only after malware scanning and retention are implemented.
- Add email intake/reply or other channels only after channel ownership, consent and identity matching are verified.
- Maintain one canonical case record across channels; deduplicate by trusted provider message ID.

## 14. Acceptance criteria

- [ ] Reuses the existing NOVA application and Supabase Auth; no duplicate customer identity or dashboard.
- [ ] Customers can only list/read/write their own cases.
- [ ] Customer API never returns internal notes or internal-only events.
- [ ] Non-staff and inactive staff cannot reach staff queue or staff case APIs.
- [ ] Assigned/team scope is enforced server-side for every staff case read/write.
- [ ] Case transitions and corresponding audit events are atomic and deterministic.
- [ ] Retry/idempotency, message ordering, reopen and SLA pause/resume have contract tests.
- [ ] AI only answers from approved sources or transparently hands off; all sensitive cases route to a human.
- [ ] Prompt injection and secret-exfiltration regression tests pass.
- [ ] Two-user and staff authorization acceptance passes in isolated non-production staging.
- [ ] Exact-head CI passes and deployment is matched to the reviewed commit before any release claim.
- [ ] Exness Demo remains read-only; order submission and Live Trading remain OFF.

## 15. Open decisions / blockers

1. Who provisions and approves the first support staff membership, and what identity is allowed to grant support_admin?
2. What support coverage hours, holiday calendar and target response times can actually be staffed?
3. What is the canonical organization/workspace model, if team or company customers are introduced? Until then use the authenticated user as owner.
4. Which email provider, if any, will be approved for external notifications?
5. Which isolated staging project and migration baseline will be used for support acceptance? Do not create a paid branch or modify production to unblock this.
6. What retention period applies to case content, diagnostics and audit events?

## Safety invariant

NOVA remains Read-only + AI Analysis. No support feature grants broker write access, order submission, position mutation, automated trading or Live Trading.