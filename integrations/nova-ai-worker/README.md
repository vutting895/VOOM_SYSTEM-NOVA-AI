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


## Verified MT5 market analysis endpoint

`POST /api/market/analyze` accepts only `connectionId`, exact MT5 `symbol`, `timeframe` and bounded `count`. The Worker forwards the signed-in user's Supabase bearer token to the fixed System Integration Hub origin; it does not accept a client-selected URL, tenant ID, account ID or upstream host. The Hub enforces owner-scoped connection access and the Bridge/Proxy verify the actual Demo/Live terminal environment.

- Requires a Hub response with `dataVerified=true`, exact requested symbol/timeframe, at least 60 chronologically ordered valid OHLC candles, and a broker tick no older than 120 seconds.
- Calculates EMA20, EMA50, Wilder RSI14 and ATR14 from the verified candles. It emits `bullish_watch`, `bearish_watch` or `neutral` as a research classification only.
- Cloudflare Workers AI explains the computed indicators when available; if the AI binding fails, a deterministic explanation is returned. The model does not choose the classification or control any side effect.
- The response includes source environment, provider timestamp, data freshness, indicator values and `riskStatus=not_evaluated`.
- No entry price, lot size, stop/target order instruction, order authorization or broker mutation is produced. `executionEnabled`, `ordersEnabled` and `liveTradingEnabled` remain false.

This is the first verified-data analysis slice. It is **not** the complete Wave3 + XGBoost + PyTorch LSTM + SMC production model stack, does not prove profitability, and is not a substitute for chronological out-of-sample evaluation or the deterministic Risk Engine.
