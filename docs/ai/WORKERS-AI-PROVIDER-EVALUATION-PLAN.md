# NOVA Workers AI Provider Evaluation Plan

Status: DEVELOPMENT / NOT CONNECTED TO NOVA RUNTIME
Date: 2026-11-26
Base: main at 821db357d70d3613b0ca61520eaae5c5307e8fd4

## Objective

Evaluate Cloudflare Workers AI as a zero-cost-eligible inference provider for NOVA without changing the production runtime, enabling paid usage, or introducing broker/trading side effects.

This is not an OpenAI GPT integration. Workers AI-hosted open models and OpenAI API are distinct providers with separate credentials, billing, model capabilities, and data handling.

## Verified account-level facts

- Cloudflare account has an existing AI Gateway named `nova-ai`.
- The Gateway is configured with authentication enabled, BYOK-only enabled, ZDR enabled, and request log collection disabled.
- AI Gateway credit balance was read as USD 0; no default payment method; auto top-up threshold and amount are 0.
- Account Billing Profile and Billing Spend Policies could not be inspected because the connected Cloudflare authorization lacks accepted billing scopes. Do not infer those settings.
- A direct Workers AI REST inference request succeeded for `@cf/aisingapore/gemma-sea-lion-v4-27b-it`.
- The test returned 31 prompt tokens, 20 completion tokens, 51 total tokens, and 1.997916 Neurons.
- The test was an isolated provider smoke test, not a NOVA runtime integration or production readiness test.

## Candidate models

1. `@cf/aisingapore/gemma-sea-lion-v4-27b-it`
   - First candidate for Thai and Southeast Asian language tasks.
   - Documented context window: 128k.
   - Documented zero data retention.
   - Already passed one minimal Thai smoke test in the Cloudflare account.

2. `@cf/zai-org/glm-4.7-flash`
   - Candidate for agent dialogue, instruction following, and multi-turn function calling.
   - Documented context window: 131,072.
   - Documented reasoning and function calling support.
   - Must run the same task suite before any routing decision.

3. `@cf/google/gemma-4-26b-a4b-it`
   - Optional reasoning candidate; not yet tested in this account.

Do not assume model availability, Free-plan eligibility, or effective cost from the model catalog alone. Check live model response and account usage before expanding tests. Avoid models explicitly requiring paid billing.

## Proposed architecture boundary

- Keep existing Gemini provider and current NOVA runtime unchanged during this evaluation.
- Add a separate Workers AI provider adapter behind the existing provider interface only after the current provider contract and runtime call sites have been inspected.
- Use Cloudflare Workers AI account-scoped REST API or a Cloudflare Worker AI binding. Never expose the Cloudflare API token to browser code.
- Keep OpenAI as a separately configured optional provider. ChatGPT subscription access is not an OpenAI API credential.
- Do not route broker commands, approvals, risk-setting writes, or order execution through any LLM provider. LLM output is advisory/untrusted input; deterministic policy and hard-risk gates remain authoritative.
- Do not send broker credentials, account identifiers, private user data, or raw trading account history to model prompts.

## Quota and cost guard requirements

Cloudflare documents a Free allocation of 10,000 Neurons per day; limits reset at 00:00 UTC. Requests beyond the Free allocation fail on Workers Free. Paid Workers usage above the allocation is billable. Some high-capacity models require a paid plan.

Before NOVA runtime integration:
- Implement a durable, shared daily usage ledger (not process-local counters).
- Enforce a hard stop before the account-level Free allocation is exhausted; reserve a safety margin.
- Make the provider fail closed on unknown usage, ledger unavailability, or provider errors.
- No automatic upgrade, top-up, payment method, or paid fallback.
- Never silently fall back to OpenAI or another paid provider.
- Record only minimal sanitized telemetry: provider, model, timestamp, request token counts, reported Neurons, outcome, and correlation ID. No prompt or completion content by default.
- Reconcile local ledger against Cloudflare usage reporting where available.

## Evaluation protocol

Run a frozen, versioned benchmark with identical prompts and decoding settings across candidate models. Store prompts and expected criteria in repository tests; keep any sensitive or user-specific data out.

Task groups:
- Thai comprehension, summarization, and instruction adherence.
- English technical explanation and code review.
- Structured JSON generation with schema validation.
- Tool/function-call selection and argument validity (no actual tool execution).
- Refusal behavior for unsafe trading/execution requests.
- Long-context retrieval and contradiction detection.
- Robustness to prompt injection in untrusted retrieved text.

Metrics:
- Exact schema validity / parse rate.
- Task pass rate under a human-reviewed rubric.
- Hallucination and unsupported-claim rate.
- Tool-call precision and invalid-argument rate.
- Median and p95 latency.
- Neurons per successful task and estimated daily capacity.
- Failure rate, rate limits, and out-of-capacity errors.

Minimum gate:
- At least 100 frozen cases per supported task group.
- Two independent runs per model and fixed seed where supported.
- No critical policy violation in the safety suite.
- No routing promotion based on one smoke test or vendor benchmark claims.
- Keep the current primary provider unchanged until benchmark results are reviewed.

## Safety invariants

The provider adapter must not import or call broker APIs, order APIs, MT5 bridge mutation paths, approval mutation paths, or trading toggles.

Required constants remain false:
- ordersEnabled
- executionEnabled
- liveTradingEnabled

No deployment, secret creation, Gateway mutation, D1 migration, billing change, or Main-branch update is authorized by this plan.

## Exit criteria

The evaluation is complete only when:
1. The current provider interface and call sites are documented.
2. The adapter is implemented on a development branch with unit tests.
3. Quota accounting and hard-stop behavior are tested, including concurrent requests and ledger failure.
4. The frozen benchmark results and model cost/latency measurements are attached.
5. A separate review explicitly approves any runtime routing change.

Until then, status remains EVALUATION ONLY / NOT CONNECTED TO NOVA RUNTIME.
