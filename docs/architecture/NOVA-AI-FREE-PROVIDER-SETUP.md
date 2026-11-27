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
| `GROQ_API_KEY` | `GROQ_FREE_TIER_CONFIRMED=true` | `GROQ_MODEL=llama-3.3-70b-versatile` |

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
