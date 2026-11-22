# Local development, deployment, and rollback

## Local development

```bash
cp .env.example .env   # set publishable Supabase values; leave API URL empty until the Worker exists
npm install
npm run dev            # http://localhost:8080
npm run typecheck
npm run test
npm run build
```

## Hosting architecture

- Frontend: Netlify using `@netlify/vite-plugin-tanstack-start`. The repository-root `netlify.toml` selects `apps/nova-command-center` as the build base; the app-local `netlify.toml` keeps local Vite emulation rooted at `.`. Netlify publishes `dist/client`; SSR and server routes are handled by Netlify Functions.
- API: a separate Cloudflare Worker per `worker-api-contract.md`. The frontend calls that API through `VITE_NOVA_API_BASE_URL`.
- Netlify build configuration does not deploy from this local build. Production deployment and site settings must be handled separately and explicitly approved.

## Supabase (manual, reviewed)

1. Read `supabase/migrations/*_DRAFT.sql`. It only creates schema `nova`; it does not touch `public`.
2. Test on a Supabase branch or local stack first (`supabase start`, `supabase db reset`).
3. Apply to production manually. Expose `nova` in API settings only if direct reads are needed; the Worker is preferred.
4. Auth: enable email/password, disable public sign-ups if accounts are admin-provisioned, and set Site URL/redirect URLs to the approved domain.
5. Assign roles server-side: `auth.admin.updateUserById(id, { app_metadata: { nova_role: "operator" } })`.

## Rollback

- Frontend: use the previous successful deploy from the Netlify deploy history; no rollback is performed by this repository change.
- API Worker: use the Cloudflare Worker rollback procedure.
- Database: the rollback block at the bottom of the draft migration (`drop schema nova cascade`) destroys `nova` data; export first and apply manually only after review.
