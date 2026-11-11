# NOVA Hybrid LLM Core — Phase 1

## Scope

This package establishes a provider-neutral, research-only chat service and a bounded local Ollama adapter. It is deliberately not exposed as an HTTP endpoint in this phase.

## Runtime

- Provider: Ollama local runtime using `POST /api/chat`.
- Default model: `llama3.2:1b` (must already be installed locally).
- Default endpoint: `http://127.0.0.1:11434`.
- No cloud API key or paid inference provider is required.
- Only loopback URLs are accepted. Do not expose Ollama directly to the public internet.
- Environment: `NOVA_LLM_BASE_URL`, `NOVA_LLM_MODEL`, `NOVA_LLM_TIMEOUT_SECONDS`.

## Safety boundary

- Accepts only user/assistant messages; caller-supplied system messages and extra message fields are rejected.
- Adds a fixed server-owned research-only system policy.
- Bounds message count, message length, total conversation size, generation length, timeout, and response size.
- No tools, shell, filesystem, broker adapter, arbitrary URL, or order-writing capability exists in this package.
- Every response explicitly sets `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- The package is not yet wired into the public Research Worker API. Do not expose it until Supabase session verification, tenant isolation, rate limits, and audit controls are implemented and tested.

## Validation

Run from repository root:

```bash
python -m compileall -q workers/llm_core tests/test_llm_core.py
python -m unittest discover -s tests -p "test_llm_core.py" -v
```

The CI workflow runs these checks for changes to this package. Passing unit tests do not prove model quality, installed-model availability, or production deployment readiness.

## Next phases

1. Add authenticated service integration after reviewing the existing Research Worker identity model.
2. Add structured RAG retrieval with source provenance and tenant-scoped access.
3. Add provider routing to the existing Cloudflare AI Worker without duplicating inference responsibilities.
4. Add benchmark/evaluation gates before any model or prompt promotion.
5. Keep fine-tuning disabled until the canonical Exness dataset passes provenance and coverage gates.
