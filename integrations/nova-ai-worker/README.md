# NOVA AI Worker — authenticated research interface

This folder is the source of truth for the deployed `voom-system-nova-ai` Cloudflare Worker.

## Security contract
- `GET /health` is public and exposes only service/binding readiness flags.
- Every other supported route requires a valid Supabase access token in `Authorization: Bearer …`; the Worker verifies it through Supabase Auth `/auth/v1/user`.
- Browser CORS allows only the NOVA UI origin. CORS is not treated as authentication.
- JSON requests are size-limited and validated. Unknown routes, including order routes, are rejected.
- Generated strategies are research drafts only; `executionEnabled` and `liveTradingEnabled` remain false.

## Runtime configuration
The deployment workflow passes the existing GitHub Actions values `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Worker as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public Supabase project settings, not service-role credentials. Never configure a service-role key here.

## Local test
Run `npm test` from this directory with Node.js 22+. Tests mock the Supabase Auth response; they do not use production credentials or place orders.

## Deploy
The dedicated GitHub Actions workflow deploys this Worker only when this folder changes on main. Cloudflare AI binding is declared in `wrangler.toml`. The frontend API route forwards the authenticated user's access token to this Worker; it must never forward an unauthenticated request.


## Authenticated Chat and Zero-Menu intent contract

- `POST /api/chat` requires an authenticated Supabase bearer session. It accepts only bounded user/assistant messages; it does not accept system-role messages or any order/execution tool.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The shared schema is `shared/nova-intent-envelope.schema.json`; the allow-listed renderer is `frontend/components/intent-result.jsx`. No model-generated HTML/JavaScript is evaluated.
- This first pass is deterministic and research-only. It does not yet connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.


## NOVA-MTF-001 research knowledge

The authenticated chat system prompt includes the NOVA multi-timeframe research heuristics at inference time:
- D1 provides higher-timeframe context; H4 evaluates structural alignment or conflict; H1/M15/M5 refine local context.
- Lower-timeframe counter-moves are not automatically pullbacks or reversals; contradictory evidence remains unclassified unless structure supports a cautious candidate.
- The H4 2-2-2 sequence is explicitly an unvalidated hypothesis, not a universal session rule or trade rule.
- Support/resistance are treated as swing-reaction zones; structural invalidation is descriptive only.

This is prompt-context injection, **not fine-tuning**: no model weights, embeddings, training dataset, or learned parameters are changed. The chat must not claim to have inspected current prices or charts unless bars are supplied explicitly. The research specification is tracked separately in PR #285 and the internal Research Worker analyzer in PR #292.
