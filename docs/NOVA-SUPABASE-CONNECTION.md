# NOVA Supabase connection

Target project: `rovhmjeowracayicbqij`  
Project URL: `https://rovhmjeowracayicbqij.supabase.co`

## Frontend configuration

Set these values in the frontend deployment environment (never commit actual values):

- `VITE_SUPABASE_URL=https://rovhmjeowracayicbqij.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<Supabase publishable/anon key>`

Only the publishable/anon key belongs in the browser. Never expose a service-role key, database password, JWT signing secret, or provider credential in any `VITE_*` variable.

## Implemented in this change

- Shared Supabase JS client with PKCE, persisted sessions, and token refresh.
- React auth provider exposes sign-in, sign-up, sign-out, session and user state.
- Role display is read only from trusted `user.app_metadata.nova_role`; user-editable metadata is not used for authorization.
- The application root is wrapped in the auth provider.

## Important limitations

This is an integration foundation, not a production authorization claim. Existing API endpoints are not yet uniformly protected by server-side JWT verification; the UI routes are not yet gated by role; and no role assignment workflow is created here. API authorization must independently validate the Supabase JWT and enforce permissions server-side. RLS must be applied to each data table.

No production database migration, secret change, deployment, or trading capability change is performed by this commit. Live trading and broker writes remain disabled.
