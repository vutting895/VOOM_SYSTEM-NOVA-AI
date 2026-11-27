# NOVA AI Free Provider Router

## Scope

This change adds a dormant-by-default provider chain for authenticated research chat:

1. Gemini Developer API (primary)
2. Cloudflare Workers AI (fallback)
3. Groq API (fallback)

The chain is intentionally disabled until an operator confirms that each account is on an eligible no-charge tier and sets the corresponding confirmation flag. API keys alone do not enable a provider.

## Required Worker configuration

Store provider API keys only as Cloudflare Worker secrets. Never add them to Git, `.env.example`, frontend environment variables, logs, or status responses.

| Worker secret | Non-secret confirmation variable | Model default |
|---|---|---|
| `GEMINI_API_KEY` | `GEMINI_FREE_TIER_CONFIRMED=true` | `GEMINI_MODEL=gemini-2.5-flash` |
| Cloudflare AI binding `AI` | `CLOUDFLARE_AI_FREE_TIER_CONFIRMED=true` | `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.2-3b-instruct` |
| `GROQ_API_KEY` | `GROQ_FREE_TIER_CONFIRMED=true` | `GROQ_MODEL=openai/gpt-oss-120b` |

Do not set a confirmation variable until the actual account plan, region, model availability, and current quota have been checked. A provider may be disabled simply by omitting its key or leaving its confirmation flag unset.

## Cost and quota controls

- No automatic upgrade, paid-plan switch, or billing change is performed.
- No paid fallback is configured.
- A missing free-tier confirmation blocks provider calls.
- Strategy generation also checks Cloudflare free-tier confirmation before invoking Workers AI; otherwise it returns the existing rule-based research draft.
- The router attempts at most three explicitly confirmed providers.
- Provider 429 and transient 5xx/timeouts may advance to the next confirmed provider. Authentication, invalid request, and safety failures do not.
- A provider's advertised Free Tier is not a guarantee of account eligibility or unlimited capacity. Check provider console and terms before enabling.
- Provider status returns booleans only; it never returns secret values.

## Data handling

Chat content may be transmitted to the selected external provider. Do not enable external providers for sensitive personal data, broker credentials, account identifiers, or confidential strategy data without an approved data-handling policy. Gemini Free Tier data handling may differ from paid service terms. Keep prompts minimized and never log prompt bodies.

## Authentication and safety

- `/api/chat` and `/api/status` require a valid Supabase bearer session.
- Browser requests use the existing allowlisted CORS origins.
- No API key is exposed to the browser.
- Provider routing does not create broker tools, order routes, or execution permissions.
- `executionEnabled=false` and `liveTradingEnabled=false` remain explicit invariants.

## Validation

Run from `integrations/nova-ai-worker`:

```sh
node --test
```

No production secrets, account settings, Supabase schema, or deployment configuration are changed by this implementation. Before production rollout, review the pull request, run tests, verify free-tier eligibility in each provider account, and use a separately approved deployment process.

## Additional providers researched (not enabled in this router)

| Provider | Current free access evidence | Decision |
|---|---|---|
| OpenRouter | Has rotating $0 models; free variants are rate-limited (currently 20 RPM / 50 RPD unless an account has purchased credits). Some $0 models may require a funded account. | Candidate only; model availability and data handling vary by upstream provider. |
| Cohere | Evaluation/trial API keys are free but limited (trial keys are capped at 1,000 calls/month for covered chat models). | Candidate for classification/embeddings, not primary chat. |
| Mistral | Current Admin docs state Free mode does not include API access; API use requires billing activation and pay-as-you-go. | Exclude from zero-billing API router. |
| Cerebras | Developer access starts with a one-time $5 promotional credit requiring a valid payment method; it expires after 30 days and is not a permanent free tier. | Exclude from permanent-free provider list. |
| SambaNova | Its Free plan asks users to add a payment method and purchase credits to run API requests. | Exclude from permanent-free provider list. |
| Hugging Face Inference Providers | Current Free account includes no monthly inference credits; paid PRO/Team/Enterprise accounts include credits. | Exclude from zero-cost API router. |
| GitHub Models | Fully retired on July 30, 2026. | Not available. |

Free-model availability is volatile. OpenRouter is the most useful extra candidate for later testing, but it should not be treated as a guaranteed always-on provider. Its free variants can be exhausted at modest daily request volume. Cohere's trial is better for narrow auxiliary tasks than a user-facing general assistant.

## Provider model maintenance

- Gemini default is `gemini-2.5-flash`, which currently lists free input/output token pricing on the Gemini Developer API pricing page. Free-tier prompts may be used to improve Google's products.
- Groq default is `openai/gpt-oss-120b`; do not use deprecated `llama-3.3-70b-versatile`.
- Cloudflare AI's current Free plan allocation is 10,000 Neurons/day. If the account is on Workers Paid, usage above the included allocation is billable. The confirmation flag must only be set after verifying the actual account is on Workers Free and reviewing the Neuron dashboard.
