# Local dev, build, deploy, rollback

## Local development

Run commands from this directory:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

The Netlify build uses this directory as its base, runs `npm run build`, and publishes `dist/client`. The `@netlify/vite-plugin-tanstack-start` adapter packages TanStack Start SSR/server routes for Netlify Functions. Do not add a static SPA catch-all rewrite: it can bypass SSR route handling.

Before enabling production CI, generate and commit this app's package lockfile (for npm, `package-lock.json`) and verify a clean install with `npm ci`. The repository currently has no lockfile in this app directory.

## Netlify environment

Configure only the public build-time variables required by the frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key only)
- `VITE_NOVA_API_BASE_URL` (optional until the read-only API is available)

Never put service-role keys, Worker secrets, broker credentials, or other private values in `VITE_*`.

The app must remain fail-closed when Supabase or the read-only API is not configured. LIVE TRADING, BROKER WRITES, ORDER PLACEMENT, FUNDS MOVEMENT, and ACCOUNT MUTATIONS remain disabled.

## Supabase (manual, reviewed; not part of deployment)

1. Review `supabase/migrations/*_DRAFT.sql`.
2. Test on a Supabase branch or local stack first (`supabase start`, `supabase db reset`).
3. Do not apply migrations to production as part of a frontend deployment.
4. Configure Auth redirect URLs only after the target domain is approved.
5. Assign roles server-side through trusted administrative tooling; never trust frontend role state for authorization.

## API

The API remains a separate Cloudflare Worker boundary per `worker-api-contract.md`. The browser client is GET-only. No broker execution, order, withdrawal, transfer, deposit, or account-mutation endpoint is enabled by this frontend change.

## Deployment and rollback

This change only prepares the repository's Netlify build configuration. It does not deploy anything.

When separately authorized, Netlify should build from `apps/nova-command-center` and serve `dist/client`; SSR routes/functions must be verified in a non-production preview before any production cutover. Roll back through Netlify's prior immutable deploy only after explicit approval.

## Legacy migration

The previous Root SPA is retained in the repository as a migration source. This branch changes the configured Netlify build root; it does not delete legacy source code or migrate its modules. Module-by-module migration remains tracked separately.