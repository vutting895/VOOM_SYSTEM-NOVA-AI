# VOOM SYSTEM Member Registration

## Frontend
- Public registration page: `Dashboard/register.html`
- Uses the existing Supabase project and publishable browser key only.
- Creates accounts through Supabase Auth email/password sign-up.
- Requires a name, valid email, password of at least 8 characters, and matching confirmation.
- New users must always receive the `customer` role. The form does not accept or send a role value.
- Email-confirmation redirects to `/register.html?confirmed=1`.

## Required Supabase migration
Apply `Supabase/migrations/20261024_000001_customer_signup_profile_trigger.sql` in Supabase SQL Editor after the existing core and role migrations. It creates a profile on Auth-user creation and assigns the fixed least-privilege `customer` role. The trigger function is security-definer with an empty search path and direct execution is revoked from public/anon/authenticated.

Before enabling sign-ups:
1. Confirm Email/password provider is enabled in Supabase Authentication → Providers.
2. Configure Authentication → URL Configuration to allow the production Dashboard origin and the redirect path `/register.html`. Do not use wildcard redirect URLs.
3. Decide whether email confirmation is required; keep it enabled for public registration where practical.
4. Verify a newly registered user gets exactly one `customer_profiles` row with `role = 'customer'` and cannot access staff/admin views.
5. Test duplicate email, invalid email, weak password, confirmation mismatch, email confirmation and mobile layout.

## Deployment / access protection
The Vercel project currently has SSO protection reported as enabled for all deployment types. A public registration page cannot be used by unauthenticated visitors while that protection applies. Do not disable protection for the entire project without first separating public member routes from private staff/admin screens or applying a route-safe access design. The project-specific deployment URL may also remain on an older immutable deployment until a new Vercel deployment succeeds.

## Current boundary
Registration creates a Supabase Auth account and customer profile only. It does not grant staff/admin access and does not by itself provide a customer trading portal or enable live trading.
