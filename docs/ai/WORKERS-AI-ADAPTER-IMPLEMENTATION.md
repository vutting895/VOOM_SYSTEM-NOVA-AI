# Workers AI Adapter — Implementation Record

**Branch:** `feat/nova-workers-ai-provider-evaluation-20261126`  
**Status:** implementation authored; execution validation pending  
**Runtime routing:** disabled

## Added files

- `src/ai/providers/types.ts`: provider-neutral text-generation contract.
- `src/ai/providers/cloudflareWorkersAiProvider.ts`: isolated REST adapter for the explicitly allowlisted GLM-4.7-Flash model.
- `tests/workers-ai-provider.test.mjs`: deterministic tests for successful response parsing and failure handling.

## Adapter contract

The adapter uses Cloudflare's account-scoped REST inference route and keeps the bearer token server-side. It has no browser integration, no implicit provider fallback, no access to broker APIs, and no dependency on market or quant data.

Safety behavior:
- One allowlisted model only: `@cf/zai-org/glm-4.7-flash`.
- Output limited to 32–1,024 tokens; default 256.
- Each message is limited to 16,000 characters and the combined request is limited to 32,000 characters.
- Request timeout bounded to 500–30,000 ms; default 12 seconds.
- Thinking disabled using `chat_template_kwargs`; output budget uses `max_completion_tokens`.
- Accepts only a non-empty text response with `finish_reason: stop`.
- Treats `finish_reason: length` as a hard failure.
- Maps authentication, forbidden, quota, upstream, network and timeout failures to sanitized error codes.
- Never logs prompts, completions, tokens or raw upstream error bodies.
- Does not retry or route to a paid provider automatically.

## Test coverage authored

The test file covers:
1. Valid response, usage parsing and request payload constraints.
2. Truncated response rejection.
3. Empty content rejection.
4. Malformed response envelope rejection.
5. HTTP 401, 403, 429 and 503 mapping.
6. Request timeout.
7. Invalid message count and output bounds.
8. Invalid configuration and unsupported model.
9. Combined prompt-size limit.

Run locally from the repository root after installing the declared dependencies:

```bash
node --import tsx --test tests/workers-ai-provider.test.mjs
npm run lint
```

**Important:** These commands have been added as validation instructions; neither command has been executed in this task. No test pass is claimed.

## CI integration

The manual `Frontend CI` workflow now includes the focused adapter test command. The workflow remains `workflow_dispatch` only, so this change does not create additional automatic PR runs. Select this branch when manually dispatching the workflow to validate the branch contents.

## Explicitly out of scope

- No import or invocation from `server.ts`.
- No replacement of Gemini.
- No connection to `/api/chat`, `/api/gen-ai/generate`, Python research runtime, quant engine, approval lifecycle or broker.
- No D1/KV/Durable Object quota ledger. Production activation remains blocked until a durable, concurrency-safe quota reservation mechanism is designed and tested.
- No secret creation, deployment, billing change or Main update.

## Decision

**IN PROGRESS.** Adapter and tests are authored on the development branch. Test execution, type-check, CI evidence, benchmark results and durable quota controls remain outstanding. The adapter is not production-ready and must not be wired into the active runtime.
