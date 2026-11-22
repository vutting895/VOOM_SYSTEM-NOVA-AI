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