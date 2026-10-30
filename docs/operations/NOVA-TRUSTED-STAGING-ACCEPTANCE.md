# Trusted NOVA Staging Acceptance

Status: proposed workflow; not active until this PR is reviewed and merged to `main`, and the protected GitHub Environment is configured.

## Safety model

- The workflow is **workflow_dispatch only** and runs only when dispatched from `main`.
- It checks out `main` and executes `scripts/staging/nova-pr-customer-isolation-acceptance.mjs` from that trusted checkout. It never checks out, installs, sources, or executes PR-controlled files.
- The candidate PR is used only as an HTTP target. The workflow requires an open same-repository PR targeting `main`, verifies the exact supplied head SHA, requires a successful `netlify/voomsystem/deploy-preview` commit status for that SHA, and derives the preview URL from the PR number.
- Supabase admin credentials remain in the protected GitHub Environment runner. Only short-lived access tokens for synthetic `system_test_only` accounts are sent to the candidate Preview.
- The harness only accepts staging project ref `rovhmjeowracayicbqij`. It creates exactly two temporary accounts, exercises owner/RLS/approval isolation, signs out and deletes both accounts, and verifies their owned broker/thread/approval rows are gone. No production Supabase URL is accepted.
- All order submission and Live Trading controls remain disabled.

## Required one-time repository setup

Before running:
1. In GitHub **Settings → Environments**, create `nova-staging-acceptance`.
2. Configure required reviewers (at least one trusted maintainer), prevent self-review, and restrict deployment branches to `main`.
3. Only after those protection rules are enabled, set environment variable `NOVA_STAGING_ENVIRONMENT_PROTECTED=true`.
4. Add only staging-scoped environment secrets:
   - `NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY`
   - `NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY` (legacy JWT or modern `sb_secret_...`; never printed)
   - optionally fresh `NOVA_STAGING_CAPTCHA_TOKEN_A` and `NOVA_STAGING_CAPTCHA_TOKEN_B` for the two one-use password sign-ins if staging Auth CAPTCHA is enabled. Refresh both before each run; never reuse a Turnstile token.
5. Confirm the Netlify Deploy Preview context is configured to use the same staging Supabase project. The harness fails closed if the supplied staging token cannot authenticate against the Preview.

## Run

After the workflow is merged to `main` and the environment is configured, run **NOVA Trusted Staging Customer Isolation** from the Actions tab, selecting `main`. Supply the exact open PR number and its 40-character head SHA. The workflow rejects stale SHA values and non-successful exact-SHA Netlify previews.

This PR does not create or modify GitHub Environment rules, add secrets, run the workflow, create staging users, write to Supabase, deploy Workers, or change Production.
