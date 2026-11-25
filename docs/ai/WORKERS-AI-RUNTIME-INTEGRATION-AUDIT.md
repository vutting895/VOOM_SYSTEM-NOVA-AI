# Workers AI Runtime Integration Audit

**Audit date:** 2026-11-26  
**Audited base:** `main` at `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Evaluation branch:** `feat/nova-workers-ai-provider-evaluation-20261126`  
**Scope:** read-only repository inspection; no runtime or trading changes.

## Executive finding

Do not wire Cloudflare Workers AI into the trading or quant decision path yet. The repository does not currently expose a single shared provider contract across its TypeScript application and Python research worker. The visible TypeScript chat path calls Gemini directly, while the Python research worker has no cloud LLM provider dependency. A local Ollama prototype exists, but it is isolated and is not evidence of a production provider abstraction.

## Verified code paths

| Path | Observed behavior | Integration implication |
|---|---|---|
| `server.ts:getGeminiClient()` | Creates `GoogleGenAI` only when `GEMINI_API_KEY` is present. | Existing cloud-provider code is coupled directly to the Express server. |
| `POST /api/chat` | Calls `ai.models.generateContent()` with a hard-coded Gemini model. | This is the only inspected live Gemini inference call in `server.ts`. |
| `POST /api/gen-ai/generate` | Builds and returns a deterministic template; it does not call Gemini or Ollama. | Its `llm.available: true` metadata is not proof that an LLM request occurred. Treat as a correctness gap, not as a provider call site. |
| `runInternalQuantExecutionEngine()` | Uses hard-coded instrument prices, confidence, VPIN, ATR, drawdown and sizing constants. | These values are not verified broker/market data or measured model outputs. An LLM adapter must not consume them as authoritative evidence or convert them into executable signals. |
| `workers/runtime.py` | FastAPI research endpoints for SMC, Elliott Wave, backtest, walk-forward and risk approval; health response says orders/live trading disabled. | Separate Python service; no shared LLM provider contract found in this file. Keep this service isolated. |
| `workers/schemas.py` | Typed inference report; forbids execution and live trading flags. | Reuse its read-only principle, but do not conflate prediction schema with chat completion schema. |
| `workers/gen-ai/llm_strategy_prototype.py` | Local Ollama HTTP adapter with worker allowlist, JSON parsing and bounded TP/SL validation. | Existing prototype can inform a provider-neutral interface and schema-validation tests. It is not connected to the Express Gemini route. |

## CI findings

- The repository tree contains GitHub Actions workflows but no `.circleci/config.yml`.
- The observed CircleCI status for this evaluation commit is `error`, with the provider message: `No configuration was found in your project.`
- The GitHub check named `Supabase Preview` was `skipped` because preview branches are disabled. This is not a test pass.
- The GitHub status from Vercel says there are no required projects to validate; it does not establish application build or test success.
- No tests are claimed as executed by this audit.

## Cloudflare API integration boundary

Cloudflare documents an OpenAI-compatible Workers AI Chat Completions endpoint at:

`https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`

The request uses a Cloudflare API token, an account ID, and a model name such as `@cf/...`. This is an API compatibility format, not an OpenAI model or an OpenAI API credential. See: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/

For this repository, any future adapter must:
1. Be a server-side text-generation provider only; never accept broker credentials or expose the Cloudflare token to the browser.
2. Use a strict model allowlist and a bounded maximum output size and timeout.
3. Validate response envelope, finish reason, non-empty content, and any requested JSON schema. A truncated response is a failure, not a partial success.
4. Fail closed on quota, authentication, timeout, malformed output, or unknown usage state. Do not fall back to a paid provider.
5. Emit sanitized metadata only (provider, model, duration, token/Neuron usage if supplied, status, correlation ID); do not log prompts, secrets, or full completions by default.
6. Remain behind an explicit evaluation/configuration gate until the frozen benchmark passes.
7. Never produce or modify market prices, risk limits, broker orders, approvals, or execution permissions.

## Required implementation sequence

1. Define a provider-neutral TypeScript contract for text generation and a separate validated response schema.
2. Add a Cloudflare Workers AI adapter with dependency-injected `fetch`, allowlisted model IDs, timeout/abort handling, response validation and sanitized errors.
3. Add deterministic unit tests for success, empty content, truncated/length finish, malformed JSON, 401/403, 429/quota, 5xx, timeout and unsupported model.
4. Add a durable quota reservation interface and concurrency tests before enabling repeated production requests. Do not use process-local counters as a cross-instance quota guard.
5. Add a benchmark harness with frozen cases and recorded model/version/config. Keep the current Gemini route unchanged until comparative evidence is reviewed.
6. Only after a separate review, expose Workers AI as an opt-in chat explanation provider. Do not route it into the quant engine, strategy generation or any broker path.

## Current decision

**Status: IN PROGRESS — architecture audit complete; runtime adapter NOT implemented.**

No secrets, Cloudflare resources, Gateway settings, billing, deployment, database, Main branch, broker state, or trading flags were changed. Live trading and order execution remain disabled.
