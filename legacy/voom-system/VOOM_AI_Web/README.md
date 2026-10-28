# VOOM AI Private Web Chat

Standalone responsive chat UI and Cloudflare Worker API. Kept separate from the MT5 bridge, trading AI Worker, main dashboard, and local-only Security Dashboard.

## Security model

- Browser uses only the Supabase publishable key for password sign-in. It is not an admin/service-role key.
- The Worker validates the Supabase access token with Supabase Auth on every chat request.
- The Worker checks the authenticated, verified email against the server-only VOOM_AI_ALLOWED_EMAILS allowlist. An empty allowlist denies every chat request.
- The OpenAI API key is a Worker secret only; never add it to public assets, source code, Git, browser storage, or chat messages.
- Same-origin API only: APP_ORIGIN must match the exact deployed HTTPS origin.
- No CORS wildcard, client-supplied system prompt, tools, service-role access, MT5 order access, or Security Dashboard access.
- Conversation history is memory-only and is not stored in a database. Request content and credentials are not logged by this application.
- User registration is not offered by this UI. Accounts must already exist in Supabase Auth and be email-confirmed.
- The web shell is not a security boundary by itself; the Worker enforces access control for AI requests.

## Required Worker secrets / variables

Set these for this Worker only in Cloudflare Dashboard or Wrangler.

Secrets:
- OPENAI_API_KEY — OpenAI API secret key.
- VOOM_AI_ALLOWED_EMAILS — comma-separated exact email allowlist.

Non-secret variables:
- SUPABASE_URL=https://tlyyxufuiimrbaksoitf.supabase.co
- SUPABASE_PUBLISHABLE_KEY — Supabase publishable key (not service-role).
- APP_ORIGIN — exact deployed HTTPS origin, e.g. https://voom-ai-private-chat.<your-workers-subdomain>.workers.dev.
- Optional OPENAI_MODEL=gpt-4.1-mini.

Do not configure the service-role key. Do not deploy until the allowlist and AI API key are set. OpenAI API use may incur charges.

## Deploy

1. Install Wrangler in this folder: npm install --save-dev wrangler.
2. Authenticate Cloudflare CLI: npx wrangler login.
3. Set secrets without putting values in source files:
   - npx wrangler secret put OPENAI_API_KEY
   - npx wrangler secret put VOOM_AI_ALLOWED_EMAILS
4. Set the non-secret variables in Cloudflare Worker settings or Wrangler vars.
5. Confirm APP_ORIGIN exactly matches the final HTTPS hostname, then run npx wrangler deploy.
6. Verify unauthenticated POST /api/chat returns 401, a non-allowlisted verified user returns 403, malformed requests return 400, and an authorized user receives a model reply.
7. Confirm Security_Dashboard remains local-only and the existing Worker/ trading veto Worker and EA files remain unchanged.

## First phase boundaries

This is a private online chat shell; it does not yet connect to the local MCP stdio server or retrieve private Research documents. That requires a separate authenticated knowledge bridge or curated private retrieval store and must not expose the Research folder publicly. Chat memory is not persisted. No changes are made to the existing trading execution path.

## Local checks

Run: node --test tests/worker.test.js
