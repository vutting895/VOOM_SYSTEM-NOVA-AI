# NOVA Affiliate Video Studio — Phase P0

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Baseline:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Status:** P0 design and access-readiness; no Meta account connected; Option C custody architecture remains Draft  
**Frontend:** Netlify (`voomsystem.netlify.app`)  
**Backend control plane:** existing Cloudflare System Integration Hub  
**Database:** existing Supabase project (Free plan)  
**Publishing policy:** approval required; automatic publishing disabled

## 1. Owner-provided Page context

- Page label supplied by the owner: `V-services center`.
- Facebook profile supplied by the owner: `suwa.pat.35`.
- The owner explicitly confirmed that this profile is used to manage the Page.
- Share URLs supplied during discovery: `https://www.facebook.com/share/1Dr5iXfee8/` and `https://www.facebook.com/share/19iiVwxtao/`.
- These are owner-provided statements, **not** proof of Meta identity, Page ID, admin role, Business Portfolio ownership, or API authorization.
- Canonical Page ID, Page URL, available Page tasks, linked Instagram account, and insights remain unverified until OAuth and API discovery succeed.

Do not infer identity from a personal profile URL or treat a share redirect as a canonical Page URL.

## 2. Repository-first architecture decision

Extend the existing NOVA application and authenticated Cloudflare System Integration Hub. Do not create a second dashboard, gateway, OAuth identity system, or credential store.

- Dashboard entry: one NOVA Main Dashboard module using the existing authenticated owner-scoped workspace/session model.
- Browser: initiate OAuth and display sanitized connection state only.
- OAuth callback: dedicated same-origin Next.js route on the Netlify frontend, with the exact redirect URI registered in Meta and validated against server configuration.
- Backend: existing System Hub owns state validation, code exchange, Page discovery, permission checks, owner binding, and audit correlation. Never exchange app secrets in browser code.
- Persistence: store only Page metadata and an opaque custody reference in Supabase. Meta user/Page tokens and all provider credentials must be held by the separately isolated Secret Custody Plane selected under Option C; the System Hub, AI Worker, MCP server, and browser must never receive plaintext credentials or custody keys. Option C remains a Draft architecture proposal in PR #130, not a deployed service.
- AI: research and draft content only. Model output is untrusted input and cannot invoke publish actions.

## 3. Meta OAuth permission stages

Request the minimum permission set for each stage. Do not request advertising, messaging, or unrelated personal-profile permissions.

### P0-A — identify managed Pages (read-only)

- `pages_show_list`: enumerate Pages the authorizing person manages.
- `pages_read_engagement`: read Page-owned content/engagement data where permitted.
- Use the authorization result to select the exact Page and record its Page ID, name, canonical URL, and granted tasks.
- Read-only Page insights require `read_insights` when the relevant endpoint/metrics require it; request this only in a separately explained consent step.

### P0-B — content publishing (not enabled)

- `pages_manage_posts` is deferred until the content workflow, approval ledger, token custody, App Review, and explicit owner authorization are complete.
- No post, photo, Reel, video, schedule, edit, or delete request may be sent in P0.
- App Review / Advanced Access and Business Verification requirements must be evaluated against the actual production use case before inviting non-app-role users.

The app must display requested permissions and their purpose before the user proceeds. Handle partial grants and denied scopes without failing open.

## 4. OAuth and token custody security requirements

- Use Meta's supported Facebook Login / Login for Business flow and a currently supported Graph API version selected at implementation time.
- Generate high-entropy, single-use `state`; bind it to the authenticated NOVA user, session, redirect URI, and short expiry. Validate it server-side and reject replay, mismatch, expiry, or missing state.
- Use PKCE if supported by the selected Meta login configuration; keep App Secret and code exchange server-side.
- Validate redirect URIs against a fixed allowlist. Never accept a client-supplied callback URL or arbitrary Graph API host.
- Exchange authorization codes only inside the approved server-side custody boundary; never log authorization codes, access tokens, app secrets, or full callback query strings.
- Bind the returned Page to the authenticated NOVA owner. The custodian must independently validate the customer Supabase session and resolve the Page/connection binding from trusted metadata and its own registry. Do not trust a client-supplied user ID, tenant ID, Page ID, custody reference, or task list as proof of ownership.
- Follow owner-selected **Option C — Separate Secret Custody**. Supabase is metadata-only; it is not the customer token store. Do not implement a Supabase Vault/Hyperdrive fallback. PR #130 (`docs/separate-secret-custody-option-c-20261031`) is the current Draft architecture/API/threat-model proposal; it has no deployed custodian, selected provider, KMS/HSM, mTLS workload identity, or live integration.
- The custodian must use a separate cloud security boundary, non-exportable KMS/HSM key hierarchy, envelope encryption, independent customer-session validation, owner/connection binding, read-only provider adapter allowlists, durable idempotency/reconciliation, and no-cache behavior. The System Hub may orchestrate but must not receive plaintext credentials, custody master keys, or bulk secret-read capability.
- Support disconnect/revoke, token expiry/re-authentication, permission changes, Page role removal, and deletion requests through the custodian lifecycle contract.
- Return only sanitized connection state and non-secret Page metadata to the browser and AI. Use `Cache-Control: no-store` and `Pragma: no-cache` throughout the custody path.

## 5. Content Studio workflow

1. Research global creator patterns: hooks, pacing, storytelling, retention, captions, subtitles, and calls to action. Analyze patterns; do not copy protected videos, scripts, voices, or branding.
2. Choose Thai-first beginner-friendly educational topics using relevance, audience fit, source quality, originality, policy risk, and affiliate suitability.
3. Generate an original brief, script, storyboard, narration, captions, and shot list.
4. Produce faceless AI-voice video using licensed/original assets; retain source and license metadata.
5. Run quality checks: factual review, Thai language, audio/subtitle sync, visual rights, disclosure, platform policy, and accessibility.
6. Save as a draft and request explicit human approval.
7. Publishing and scheduling remain disabled in P0. A future publishing phase must use a durable approval record bound to exact content hash, Page, destination, scheduled time, and expiry; any edit invalidates the approval.
8. Collect permitted post/Reels insights and affiliate click/conversion data only after the necessary permissions and integrations are approved.

## 6. Affiliate and disclosure controls

- Maintain an allowlisted product/affiliate registry with merchant, destination URL, commission terms, territory, expiry, and evidence source.
- Never fabricate product claims, prices, discounts, stock, commissions, or conversion results.
- Clearly disclose affiliate relationships in Thai in the content/caption where applicable.
- Do not use Meta Ads or spend money in this phase.
- No auto-purchase, order placement, or financial commitments.

## 7. Phase gates and acceptance criteria

| Gate | Acceptance evidence | Current status |
|---|---|---|
| P0-1 Repository baseline | Main SHA and relevant paths inspected | Passed for documentation baseline |
| P0-2 Page identity | Canonical Page URL + Page ID + returned Page name | Blocked: OAuth not connected |
| P0-3 Admin authorization | OAuth user identity and Page tasks verified server-side | Blocked |
| P0-4 Token custody | Option C custodian deployed in a separate security boundary; KMS/HSM, workload identity, independent session validation, no-cache, durable operation ledger, redaction and revoke tests | Blocked: PR #130 is Draft design/proof only; no provider or runtime selected |
| P0-5 Read-only discovery | Exact Page metadata and allowed read-only endpoint smoke tests | Not started |
| P0-6 Content workflow | Draft-only pipeline, provenance, rights, quality and disclosure checks | Design only |
| P0-7 Durable approval | Approval bound to content hash/Page/action/expiry; replay and cross-owner denial tests | Not started |
| P0-8 Publishing | App Review/Advanced Access, explicit user approval, exact-head tests and separate release approval | Disabled |

## 8. Implementation sequence

1. Review this P0 document and confirm the exact Page identity after OAuth; do not infer it from profile/share URLs.
2. Reconcile this PR with Option C architecture PR #130 and review its ADR, API contract, threat model, and synthetic proof limitations. Do not build against the superseded Supabase Vault/Hyperdrive candidate (#105/#112).
3. Inspect existing frontend auth callback, System Hub routing, audit model, canonical connection schema, and migration baseline before implementation.
4. Select a custodian provider only after read-only existing-account discovery and explicit owner approval; prove a separate cloud boundary, KMS/HSM policy, workload identity/mTLS, and independent session validation with synthetic data first.
5. Add an isolated Meta OAuth read-only branch only after the custody boundary is independently reviewed; use fixed callback, state validation, permission minimization, and server-side code exchange.
6. Run contract tests for state replay/expiry/mismatch, callback allowlist, denied scopes, foreign-owner Page IDs, token redaction, custody no-cache, idempotency, revoke and ambiguous outcomes.
7. Verify with the owner's Meta account in a staging/test app using a Page the owner controls; record sanitized Page ID/name/tasks and exact commit/CI evidence.
8. Implement draft-only content records and media lifecycle as a separate reviewed PR; do not mix it with OAuth.
9. Consider publishing permissions only in a later PR after durable approval and Meta App Review gates pass.

## 9. Non-negotiable safety rules

- No Facebook password collection.
- No secrets in chat, source, PRs, logs, browser storage, or AI prompts.
- No automatic publishing, scheduling, deleting, boosting, or advertising in P0.
- No production Page mutation during tests.
- No duplicate Dashboard, auth gateway, or secret store. Follow Option C; do not revive Supabase Vault/Hyperdrive as customer credential custody.
- Keep NOVA's existing tenant isolation, RLS, Netlify frontend / Cloudflare backend split, and delivery verification plan.
- Do not claim a Page is connected until Meta OAuth, Page discovery, owner binding, and sanitized read-only verification all pass.
- No production activation without a separate explicit approval.
