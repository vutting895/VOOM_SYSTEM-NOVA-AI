# Hybrid AI Gateway Contract (Phase 0)

Status: proposed contract; not a runtime implementation.

## Decision

NOVA AI and VOOM Studio Affiliate use the same provider-neutral contract and operational policy, but retain separate application runtimes, authentication boundaries, secrets, quotas, and usage ledgers. There is no cross-project proxy and no shared Gemini credential.

- NOVA keeps its existing Express / Cloudflare Hub boundaries.
- Affiliate keeps its existing Express backend and Supabase owner gate.
- Each backend owns its provider adapter and reads only its own server-side secret.
- Frontends call their own authenticated backend only.

## Goals

1. Centralize provider selection behind a small server-side adapter interface.
2. Keep Gemini as the preferred provider while allowing explicitly configured secondary providers.
3. Make provider/model selection allowlisted per task; callers cannot supply arbitrary model IDs or provider URLs.
4. Record bounded usage metadata without storing prompts, completions, API keys, access tokens, or raw provider errors.
5. Fail closed when no configured provider is available. A fallback is permitted only to an explicitly configured provider and must be reported in response metadata.
6. Preserve each application's existing authorization, tenant/owner checks, and safety gates.

## Non-goals

- No shared runtime, database, API key, service account, billing project, or customer identity.
- No automatic provider fallback to fabricated/synthetic answers.
- No browser-side Gemini calls.
- No tool execution, broker orders, withdrawals, transfers, social OAuth, or social publishing.
- No automatic model promotion or training based on model output.

## Contract

Internal request (server-to-server module call; not a public endpoint):

```ts
type AiTask =
  | "chat"
  | "market_analysis"
  | "content_generation"
  | "search_grounding"
  | "transcription"
  | "image_generation";

interface AiGenerateRequest {
  task: AiTask;
  input: unknown; // validated by the task-specific schema before provider invocation
  requestedProvider?: "gemini" | "secondary";
  requestedModel?: string; // accepted only when present in server allowlist for task
  requestId: string;
  tenantScope: string; // derived from verified server auth, never from request body
}

interface AiGenerateResult {
  provider: "gemini" | "secondary";
  model: string;
  output: unknown; // validated against the task-specific output schema
  requestId: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  fallbackUsed: boolean;
}
```

The public HTTP layer must not accept tenantScope, provider endpoint URLs, credentials, or arbitrary tool definitions from the browser. Each route validates its own input and derives tenant/owner scope from its existing authenticated request context.

## Provider policy

- Gemini is the primary provider when configured and healthy.
- A secondary provider is optional and remains disabled until its endpoint, credentials, model allowlist, data-processing terms, and cost limits are reviewed.
- Fallback is one bounded retry to the configured secondary provider for retryable provider availability errors only. Do not fallback on validation errors, authorization errors, safety refusals, or caller cancellation.
- Do not retry non-idempotent or expensive media tasks automatically.
- Model IDs are configuration allowlists, not user-controlled strings. Verify model availability against Google's current model documentation before enabling each ID.
- Set explicit request timeout, maximum input/output size, per-tenant rate limit, concurrency limit, and monthly budget circuit breaker.

## Secret and identity boundaries

- Use distinct Gemini authorization keys for NOVA and Affiliate. Prefer distinct Google Cloud projects if independent quota/billing isolation is required; separate keys in one project do not create a hard billing boundary.
- Store each key only in its own server-side secret store. Never commit it, pass it to frontend build arguments, log it, or return it in an API response.
- On 2026-11-08, Google’s published migration window for standard keys has passed: new AI Studio keys are authorization keys by default and standard keys are scheduled for rejection after September 2026. Verify key type in AI Studio; do not assume an existing GEMINI_API_KEY is valid. See https://ai.google.dev/gemini-api/docs/api-key.
- Do not rotate, create, revoke, or overwrite production secrets as part of this contract-only phase.
- Authentication and tenant ownership are enforced before any AI request. A provider adapter is not an authorization boundary.

## Usage and privacy

Persist only: request ID, tenant scope ID, task, provider, model, timestamp, latency, token counts when returned, outcome category, fallback flag, and estimated cost only when a verified pricing table is available.

Do not persist raw prompts/completions by default. Redact provider error bodies and all credential-like strings. Usage events must be tenant-scoped and idempotent by request ID.

## Application safety constraints

### NOVA

- Read-only research/analysis only.
- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- Gemini output is explanatory text, never an executable signal, broker command, or approval.
- Quantitative calculations and risk controls remain deterministic server-side code; the LLM cannot override them.
- Existing demo/fallback market data must not be represented as live or verified.

### VOOM Studio Affiliate

- Social publishing and auto-publishing remain disabled.
- AI-generated content is a draft until a human reviews it.
- Provider output cannot mark OAuth accounts connected, create published URLs, or trigger platform callbacks.
- Existing Supabase Auth and configured-owner gate remain mandatory.

## Rollout and acceptance gates

Phase 0 (this document): agree the contract and security boundaries.

Phase 1 (per repository, separate PRs):
- Implement a provider adapter module behind existing backend auth.
- Add task-specific request/response schemas and provider/model allowlists.
- Add tests for missing/invalid secrets, timeout, retry policy, redaction, output validation, tenant isolation, and disabled side effects.
- Replace direct SDK calls incrementally; do not change business behavior in the same patch.
- Add usage ledger only after its tenant ownership and retention policy are reviewed.

Phase 2:
- Configure separate authorization keys in the correct secret stores (owner action).
- Verify each key type and perform a minimal non-sensitive live API smoke test.
- Run exact-head CI and staging tests for each repository independently.

Phase 3:
- Enable routes only after security review, cost limits, runtime health, and staging acceptance.
- No production deployment or secret mutation is implied by this contract.

## Current inspection findings (2026-11-08)

- NOVA main contains `@google/genai`, a `getGeminiClient()` helper, and direct Gemini calls in `/api/chat` and other AI routes. This is SDK presence and source-code wiring, not proof that a valid key or live API request works.
- Affiliate main contains `@google/genai`, a server-side `getGenAI()` helper, and direct Gemini calls in content/chat/search/media routes. This is not proof of valid credentials or live provider operation.
- Existing endpoints need route-by-route migration; a single helper replacement is insufficient because tasks have different schemas, media payloads, grounding metadata, and risk profiles.
- The two projects' main branches and existing open PR queues are active. This phase therefore adds only an isolated contract document; implementation must be split into narrow follow-up PRs after inspecting the exact route/test surface.

## Evidence required before claiming operational readiness

- Exact deployed commit SHA for each application.
- Verified authorization-key type for each project without exposing key material.
- Successful minimal Gemini request from each backend, with redacted request ID and provider/model response metadata.
- Negative tests for unauthorized/foreign tenant requests.
- Exact-head CI success and staging runtime evidence.
- Separate evidence that the secondary provider and fallback are configured; otherwise report them as disabled.
