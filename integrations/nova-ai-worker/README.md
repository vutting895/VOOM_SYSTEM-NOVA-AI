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


## Authenticated Chat and Agent Runtime

- `POST /api/chat` requires a valid Supabase bearer session and accepts at most eight bounded user/assistant messages. System-role messages and browser-supplied tool definitions are rejected.
- The Agent uses Cloudflare Workers AI function calling with `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. This model is documented by Cloudflare as supporting function calling. The Agent executes at most three sequential tool calls per request.
- The only tools are:
  - `list_my_broker_connections` — list connections scoped to the signed-in user.
  - `get_my_connection_status` — read one of that user's connection statuses.
  - `get_my_demo_account_snapshot` — read an existing connected Exness MT5 Demo account snapshot.
  - `get_my_demo_market_quotes` — read quotes and recent OHLC bars from an existing connected Exness MT5 Demo connection.
- Every broker read is sent only to the fixed System Integration Hub endpoint. The authenticated user's bearer token is forwarded server-to-server; the Hub validates the session and independently enforces connection ownership and Demo/read-only capability. The model never receives credentials or chooses a URL, provider, bridge route, or user ID.
- Tool names and arguments are validated server-side. Unknown tools, malformed connection IDs, unsupported timeframes, invalid symbols, missing sessions, and Hub failures fail closed. Tool output is allowlisted before it is added to the model context.
- Trade-action requests are stopped by the deterministic policy guard before inference. There is no order, broker mutation, credential-management, or Live Trading tool. `executionEnabled`, `ordersEnabled`, and `liveTradingEnabled` remain false.
- The response preserves the `nova.intent.v1` data-only envelope and adds `agent.runtime`, `agent.toolCalls`, and `agent.toolCallCount` for operational visibility. The allow-listed UI renderer remains unchanged; no model-generated HTML/JavaScript is evaluated.
- This is a bounded tool-calling Agent runtime, not yet a LangGraph graph with durable checkpointing. Conversation persistence, approval/resume and any future write-capability workflow remain separate work and require owner-scoped persistence, replay protection and a reviewed approval boundary before activation.
- Live Trading, order submission and broker mutations remain disabled.

## Request contract

```http
POST /api/chat
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

```json
{
  "messages": [
    { "role": "user", "content": "ตรวจสอบบัญชี Demo ของฉัน" }
  ]
}
```

No `thread_id`, `user_id`, broker credential, API secret or tool definition is accepted from the browser. The Worker derives the user identity from Supabase Auth and uses only the fixed tool registry.
