# Local dev, build, deploy, rollback

## Local
```bash
cp .env.example .env   # fill publishable key; leave API URL empty if no Worker yet
bun install
bun run dev            # http://localhost:8080
bun run test
bun run build
```

## Supabase (manual, reviewed)
1. Read `supabase/migrations/*_DRAFT.sql`. It only creates schema `nova`; it does not touch `public`.
2. Test on a Supabase branch or local stack first (`supabase start`, `supabase db reset`).
3. Apply to production manually. Expose `nova` in API settings only if direct reads are needed (the Worker is preferred).
4. Auth: enable email/password, disable public sign-ups if accounts are admin-provisioned, set Site URL/redirect URLs to your domain.
5. Assign roles server-side: `auth.admin.updateUserById(id, { app_metadata: { nova_role: "operator" } })`.

## Deploy (free-tier friendly)
- Frontend: Cloudflare Workers/Pages (this TanStack Start build targets Workers). `bun run build` then `wrangler deploy`. Set `VITE_*` vars at build time.
- API: separate Cloudflare Worker per `worker-api-contract.md`.
- Nothing is deployed automatically.

## Rollback
- Frontend: `wrangler rollback` (or redeploy previous git tag).
- Worker: `wrangler rollback` on the API worker.
- Database: rollback block at the bottom of the draft migration (`drop schema nova cascade`) — destroys nova data; export first.

## NOVA Core API staging

A read-only staging API is deployed for non-production verification:

- Worker: `nova-core-api-staging`
- Base URL: `https://nova-core-api-staging.suwapat787.workers.dev`
- Browser variable: `VITE_NOVA_API_BASE_URL` (base URL only; it is not a secret)
- Supabase project: the Staging project referenced by `.env.example`

Set `VITE_NOVA_API_BASE_URL` explicitly in a local or preview environment when testing the staging API. Keep it empty when an API connection is not intended. Do not copy the staging URL into the existing production Netlify `voomsystem` site's environment: that site builds the repository-root application, not this Command Center app.

Verified staging behavior: `GET /v1/health` returns 200; `GET /v1/me` without a token or with a malformed token returns 401; non-GET requests return 405. A valid signed-in user's Staging Supabase session is still required to verify a successful `/v1/me` response. This staging API currently exposes no broker, order, risk, approval, or audit routes.

This deployment does not establish that the Command Center frontend is deployed or connected. Keep frontend preview and authenticated-session verification as separate release gates.
