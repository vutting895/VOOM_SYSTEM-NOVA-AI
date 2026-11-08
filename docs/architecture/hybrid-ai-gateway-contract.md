# Hybrid AI Gateway Contract

Status: Phase 1 partial implementation; not production-ready.

## Isolation
NOVA and VOOM Studio Affiliate use separate provider adapters, backend runtimes, authentication boundaries, secrets, quotas, and usage records. No shared API key, service account, billing project, database, tenant identity, or cross-project proxy.

## Server-only contract
- Frontends call only their own authenticated backend.
- Provider selection and model IDs are server-owned allowlists.
- No browser-supplied provider URL, API key, model ID, tenant scope, or tool definition.
- Do not persist prompts, completions, raw provider errors, or credential values by default.
- Provider errors returned to clients must be sanitized.
- Gemini Authorization Keys must be stored only in each application's server-side secret store. Never paste keys into source control or chat.

## Current Phase 1 implementation
- Added `server/ai/geminiProvider.ts` independently to both repositories.
- Adapter fails closed when the server-side key is missing or a placeholder.
- Adapter allows only the internal tasks `chat`, `market_analysis`, and `content_generation`; task-to-model mapping is server-owned and currently maps to `gemini-3.8-flash`.
- Text input is limited to 24,000 characters; system instructions are limited to 4,000 characters.
- SDK request timeout is configured to 20 seconds.
- Raw SDK exceptions are replaced with a stable provider error.
- NOVA `/api/chat` and Affiliate `/api/ai/chat` use the adapter.
- Affiliate chat ignores caller-selected model/system persona, validates conversation role/size/turn order, limits history to 20 messages and the serialized input to 24,000 characters, and labels responses as draft-only.
- NOVA `POST /api/chat` now verifies a Supabase bearer session against the configured Supabase Auth `/auth/v1/user` endpoint before JSON body parsing. It derives the owner identity only from the verified Auth response. Required non-secret configuration: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`). No service-role key is used.
- NOVA chat has a process-local limiter of 10 requests per verified user per 60 seconds, with at most 2 concurrent requests per user.
- Affiliate chat remains behind the existing Supabase Auth and configured-owner gate, and has a process-local limiter of 10 requests per owner per 60 seconds, with at most 2 concurrent requests per owner.
- NOVA chat treats caller text as untrusted data separate from the system instruction. It labels legacy hard-coded quantitative values as `UNVERIFIED_STATIC_PLACEHOLDER`, `marketDataVerified=false`, and `marketDataIsLive=false`; risk/approval widgets explicitly report non-executable research-only status.
- Unit tests cover adapter fail-closed behavior, fixed model mapping, input bounds, provider-error redaction, NOVA Supabase bearer verification/redirect handling, owner-scoped in-process rate limits, and route-level security invariants.

## Limits and remaining risks
- Both rate limiters are in-memory and process-local. They do not enforce a global quota across multiple server instances or restarts and are not a durable monthly spend/budget circuit breaker. Before production, add a shared atomic limiter/usage budget at an authenticated server-side boundary, with an owner-scoped key and cost controls.
- NOVA legacy quantitative calculations still contain hard-coded placeholder values. They are now labelled unverified and are not evidence of live Exness Demo data, valid signals, model inference, or actual trading performance. Do not use these numbers to trade.
- The Supabase chat guard fails closed when `SUPABASE_URL` or a publishable/anon key is absent. Deployment configuration and owner-scoped negative staging tests are not yet evidenced.
- The Affiliate chat route has only in-process limits. Its other direct SDK routes remain unmigrated: structured content, Search Grounding, image, video, audio, music, and live voice. Each requires its own input/output schema, route-specific cost ceiling, tests, and review before migration.
- No secondary provider, automatic fallback, durable usage ledger, global rate/concurrency limiter, or monthly budget circuit breaker is enabled.
- No live Gemini request has been made. No key type, key validity, quota, or billing status has been verified.
- No secrets were created, rotated, or changed.
- No production deployment or route enablement is authorized by this PR.

## Safety constraints
### NOVA
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- LLM output is explanatory research text only and cannot issue broker commands, approve trades, or override deterministic risk controls.
- The current chat route has no verified market feed in its analysis context; do not label its quantitative placeholders as live/verified or treat the response as a validated trading signal.

### VOOM Studio Affiliate
- Preserve Supabase Auth and the configured-owner gate before AI routes.
- Generated content remains draft-only.
- Social OAuth, publishing, and auto-publishing remain disabled.

## Acceptance gates
1. Exact-head CI passes in each repository, including the new focused tests.
2. Security review confirms the auth/owner gates, input handling, and process-local limiter limitations are understood and global abuse controls are added before production.
3. The owner verifies each Gemini key is an Authorization Key without disclosing its value.
4. A minimal, non-sensitive live API smoke test succeeds separately in each backend.
5. Staging tests confirm unauthenticated and foreign-owner requests are denied.
6. Remaining task-specific routes are migrated only in separate, reviewed changes.
7. No merge or deployment until the exact PR head, base, mergeability, required checks, and review requirements are verified.

## Google API notes
Google AI Studio recommends the Interactions API for new agentic/stateful workflows. The legacy `generateContent` API remains supported; this first migration intentionally preserves the current text-generation API to minimize behavior changes. Model availability must be rechecked before enabling additional model IDs.
