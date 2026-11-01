# NOVA Model Runtime, Memory and Learning v1

## Scope and status

This increment adds a bounded chat-model runtime adapter, opt-in persistent memory APIs, and explicit quality-feedback capture. It does not create or train a foundation model. The active inference adapter uses the already configured Cloudflare Workers AI binding and a fixed model allowlist. Provider selection remains server-owned.

## Model Runtime

- Model calls remain server-side in the existing NOVA AI Worker.
- The runtime currently calls the configured Cloudflare Workers AI model @cf/meta/llama-3.2-3b-instruct.
- Browser input cannot select a model or provider. Model identifiers are restricted by a server-side allowlist.
- Inputs and outputs have strict message-count and character boundaries; persisted history is compacted to six messages of at most 1,800 characters each before inference.
- Model/provider/runtime provenance is returned for every response.
- Provider errors and invalid outputs fail closed; no fabricated answer or silent fallback is presented as model output.
- This runtime does not enable tool calling, MCP invocation, broker actions or financial execution.

## Memory

Memory is disabled by default and requires per-user opt-in.

- Threads and messages are scoped to the authenticated Supabase user; the user ID is derived from the verified bearer session, never from browser payload.
- The AI Worker uses the user's bearer token and the public Supabase publishable key. No service-role key is used.
- Postgres RLS protects settings, threads, messages, saved facts and feedback.
- Only user/assistant text is stored. Credential-pattern detection suppresses persistence of an exchange if either message resembles a bearer token, API key, password assignment, common provider token or private key. System prompts, access tokens, provider keys, broker secrets and tool payloads are not intentionally persisted.
- User-authored facts have narrow categories and size limits; they are untrusted context, never instructions.
- Retention is selectable as 30, 90 or 365 days. Expired messages and threads are purged during authenticated memory reads.
- Turning memory off deletes the user's stored threads and facts before saving the disabled setting.

## Learning

Learning feedback is separately disabled by default.

- The user may submit a 1-5 rating with one category: accuracy, helpfulness, relevance or safety.
- Feedback stores only response ID, thread ID, provider/model labels and rating metadata; it does not duplicate the conversation.
- Feedback is evaluation evidence only. It does not fine-tune model weights, alter routing, approve a candidate or promote a model.
- The evaluation helper reports sample sufficiency and ratings while always returning promotionEligible=false.
- Future training must use curated, deduplicated and consented datasets, immutable code/data/model hashes, chronological or group-isolated holdouts, baseline comparisons, safety regressions and explicit human approval.

## Release gates

1. Run the AI Worker unit suite and SQL migration tests on an ephemeral PostgreSQL database.
2. Apply the migration only to an isolated staging database after review; this PR does not apply hosted migrations.
3. Explicitly expose only the five required tables and the two authenticated RPC functions in Supabase Data API settings; verify the Worker can call them with a publishable key and user bearer token.
4. Verify two-user isolation: User A can access only A's rows; User B cannot read, update or delete A's memory or feedback.
5. Test concurrent opt-out, thread deletion, retention purge (including feedback while memory is disabled), and provider outage behavior.
6. Verify exact Worker and frontend Preview SHAs before claiming hosted memory is live.
7. Keep order submission, execution and Live Trading disabled.

## Research references

- Cloudflare Workers AI model catalog: https://developers.cloudflare.com/workers-ai/models/
- Cloudflare Workers AI platform limits: https://developers.cloudflare.com/workers-ai/platform/limits/
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Ollama structured outputs (future local-model option): https://github.com/ollama/ollama/blob/main/docs/api.md
