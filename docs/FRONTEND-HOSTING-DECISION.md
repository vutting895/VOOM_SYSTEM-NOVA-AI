# Frontend Hosting Decision — NOVA

**Decision date:** 2026-10-29  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Source of truth:** `main`  
**Selected target for the new architecture:** Netlify  
**Current fallback:** Cloudflare Workers

## Decision and operational state

The intended frontend target is **Netlify** at `https://voomsystem.netlify.app`, reflecting the updated architecture direction. This is a target decision, not a production-readiness claim.

Cloudflare Worker `voom-system-nova-ui` remains the currently verified fallback. A fresh sanitized runtime check on 2026-10-29 returned HTTP 200 for `/` and `/settings/broker`. Keep its deployment workflow intact until the Netlify candidate passes the requirements below.

## Evidence and limits

- Current main workflow `.github/workflows/cloudflare-deploy.yml` still deploys the Cloudflare frontend when `frontend/**` changes and smoke-tests the Cloudflare routes. This is a transitional mismatch with the selected Netlify target.
- PR #54 proposes root `netlify.toml` configuration so Netlify builds from `frontend/`. Its body records that `https://voomsystem.netlify.app/` previously returned HTTP 404 before that configuration was merged.
- A new read-only probe on 2026-10-29 from the authorized Windows device returned no HTTP status; therefore it proves neither success nor a fresh 404.
- The device has no Netlify CLI and `NETLIFY_AUTH_TOKEN` is not configured. This environment cannot independently trigger or configure a Netlify production deploy through the Netlify account.
- Netlify configuration, a successful GitHub CI run, or a prior Cloudflare deployment alone is not evidence that the intended Netlify commit is serving traffic.

## Netlify acceptance gates

1. PR #54 is reviewed and merged to `main`; verify that the Netlify site is actually connected to this repository and production branch `main`.
2. Configure the required environment variables in the Netlify dashboard only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Confirm the matching Turnstile Secret is set in Supabase Auth CAPTCHA configuration without exposing it.
3. Confirm the production deploy corresponds to the exact reviewed commit.
4. Verify that `/` and `/settings/broker` return HTTP 200 and the expected page content.
5. Test Supabase login, magic-link callback, session persistence after refresh, logout, and redirect allow-list on the Netlify URL.
6. Using a real Supabase owner session, verify that the owner can read their Exness Demo connection and quotes; verify a different authenticated user's connection ID is denied and produces zero Relay requests.
7. Run a separate reviewed cutover change that updates deployment workflow and relevant documentation. Only then change the Supabase Site URL/redirect allow-list. Do not alter DNS/auth redirects before these checks pass.

## Safety and rollback

- Until all gates pass, keep Cloudflare production routes and workflow available as rollback. Do not disable the Cloudflare deployment path merely because the intended target is Netlify.
- Preserve the existing Windows Bridge and dirty development worktree until the headless candidate passes separate image/security review and real staging runtime/rollback tests.
- Keep Exness Demo in **Read-only + AI Analysis** mode. Live Trading, order submission, and broker-side mutations stay OFF.
- A connected value in the database is historical state, not proof of a live authenticated owner-session read. The latest aggregate verified timestamp recorded during this review is older than the current runtime check.

## Related tracking

- [PR #54 — Netlify build configuration](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/54)
- [Issue #57 — Zero-Menu / Intent-Driven NOVA AI Dashboard](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/57)
- [Issue #33 — Exness Demo verification](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/33)
- [Issue #36 — delivery verification gates](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/36)
