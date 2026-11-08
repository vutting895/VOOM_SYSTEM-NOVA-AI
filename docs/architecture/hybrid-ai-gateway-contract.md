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
- Affiliate chat no longer accepts a caller-selected model or caller-controlled system persona. Conversation history is bounded to the latest 20 messages, with 8,000 characters per message.
- Unit tests cover missing/placeholder keys, fixed model mapping, unsupported tasks, input limits, and provider-error redaction.

## Not yet implemented or verified
- This is a text/chat slice only. Other Affiliate routes still use the existing SDK directly for structured content, Search Grounding, image, video, audio, music, and live voice. Those routes require separate schemas and tests before migration.
- No secondary provider, automatic fallback, usage ledger, tenant rate/concurrency limiter, or monthly budget circuit breaker is enabled.
- No live Gemini request has been made. No key type, key validity, quota, or billing status has been verified.
- No secrets were created, rotated, or changed.
- No production deployment or route enablement is authorized by this PR.

## Safety constraints
### NOVA
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- LLM output is explanatory only and cannot issue broker commands, approve trades, or override deterministic risk controls.
- Do not label demo or fallback prices as live.

### VOOM Studio Affiliate
- Preserve Supabase Auth and the configured-owner gate before AI routes.
- Generated content remains draft-only.
- Social OAuth, publishing, and auto-publishing remain disabled.

## Acceptance gates
1. Exact-head CI passes in each repository.
2. Security review confirms auth/owner gates are preserved.
3. The owner verifies each Gemini key is an Authorization Key without disclosing its value.
4. A minimal, non-sensitive live API smoke test succeeds separately in each backend.
5. Staging tests confirm unauthorized/foreign-owner requests are denied.
6. Remaining task-specific routes are migrated only in separate, reviewed changes.
7. No merge or deployment until the exact PR head, base, mergeability, required checks, and review requirements are verified.

## Google API notes
Google AI Studio recommends the Interactions API for new agentic/stateful workflows. The legacy `generateContent` API remains supported; this first migration intentionally preserves the current text-generation API to minimize behavior changes. Model availability must be rechecked before enabling additional model IDs.
