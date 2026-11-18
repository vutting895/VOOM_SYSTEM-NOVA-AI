---
name: auto-trade-netlify
description: Audit and implement the NOVA automated-trading web application API and Netlify delivery workflow. Trigger whenever the user mentions เว็บเทรด, เทรด auto, เชื่อม API, Deploy Netlify, อ่าน Repo, เช็ก Deploy, เปิด Bot, or เทส Bot.
---

# auto-trade-netlify

## Scope and automatic invocation
- Apply this skill automatically for any trigger phrase in the description. Do not ask whether to use the skill and do not require a long prompt.
- Begin the user-facing response with: "เรียกใช้ Skill auto-trade-netlify ให้แล้ว"
- Canonical repository for this project: `vutting895/VOOM_SYSTEM-NOVA-AI`, unless the user explicitly supplies a different repository.
- Target branch: `main`. Treat the current contents of `main` as the sole source of truth.
- This is the NOVA trading web application deployed primarily at `https://voomsystem.netlify.app/`. Preserve its existing Cloudflare Workers, Supabase, tenant isolation, and broker-bridge boundaries. Do not replace a working backend architecture with duplicate Netlify Functions.

## Mandatory repository-first procedure
1. Before every task, fetch the current `refs/heads/main` SHA and record it in the report.
2. Read the recursive repository tree from that exact main commit. Inspect all files relevant to the requested change, including API clients, backend routes, Netlify configuration, workflows, tests, environment templates, broker integrations, and safety controls.
3. Fetch the full contents of relevant files from that same SHA before making decisions. Do not use old code, snippets, or assumptions from other chats.
4. Check whether the working branch is based on the latest main. If main moved, rebase/restart the audit against the new SHA before editing.
5. Never claim the entire repository was read if only selected files were inspected. State the exact scope and any remaining uninspected areas.

## API discovery and integration
1. Inventory every frontend API call and classify it as: implemented and verified, implemented but unverified, missing, or intentionally blocked.
2. Match each route to its actual backend implementation and deployment host. Inspect authentication, tenant authorization, request validation, response shape, rate/size limits, and error behavior.
3. The browser must call same-origin `/api/*` routes only. Do not expose private upstream URLs, broker credentials, or service-role credentials to the browser.
4. Where Netlify Functions are the approved backend boundary, implement functions under `netlify/functions/` and configure explicit Netlify redirects so public paths remain `/api/*`. Example function names may include `price.js`, `portfolio.js`, `trade.js`, and `history.js`, but create only endpoints required by verified frontend contracts and actual broker capabilities.
5. Do not create generic or fake trading endpoints merely to make an inventory look complete. Do not report an API as connected until its implementation and a meaningful test or live health check prove it.
6. Before adding Netlify Functions, inspect existing Express `server.ts`, Cloudflare Workers/System Hub, MT5 read-only proxy/relay, and Supabase integration. Reuse the established authenticated backend boundary where appropriate; avoid duplicate routes and split-brain state.
7. Trading/execution routes must remain fail-closed. For the current NOVA baseline preserve `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`; never add an order-placement path without a separate explicit safety review and authorization.
8. Keep API methods, paths, payloads, response types, auth headers, and CORS/origin behavior consistent across frontend, backend, tests, and deployment config.

## Secrets and environment
- Never hardcode API keys, broker keys, passwords, signing keys, access tokens, or secrets in source, tests, docs, client bundles, or committed workflow literals.
- Private credentials must be read server-side from `process.env` (or the platform's server-side secret binding). Never expose them through `VITE_*`, `NEXT_PUBLIC_*`, client runtime config, HTML, or browser responses.
- Public publishable/anonymous keys may be exposed only when their provider explicitly classifies them as public and server-side authorization rules are still enforced.
- Maintain `.env.example` with every required variable name, a short purpose, and safe placeholders only. Never put real values in it.
- Produce a precise list of required Netlify environment variable names, scopes, and whether each is secret/public. Do not ask the user to paste secret values into chat.
- Validate required variables at function startup/request time and fail closed with safe errors that do not disclose values.

## Build, test, and deployment
1. Inspect and preserve the current `netlify.toml`; update it only when required. Confirm build command, publish directory, Node version, function directory, redirects, and SPA fallback.
2. Maintain `.github/workflows/auto.yml` for the requested automatic pipeline only after checking existing workflows for duplicate builds/deploys. Avoid creating duplicate Netlify deployment paths or multiple production deploys.
3. The intended pipeline is push to `main` -> install dependencies -> static checks/tests -> production build -> deploy to Netlify. Deployment must depend on successful build and tests; any failure blocks deployment.
4. Prefer the existing Netlify Git integration when it already deploys the validated main commit. If using Netlify CLI instead, require protected `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets and deploy only the exact tested commit. Never print secrets.
5. Do not create parallel GitHub Actions and Netlify automatic deploy mechanisms without a documented reason. Reconcile the workflow with current repository CI and Netlify settings.
6. Add tests for API route contracts, auth/tenant isolation, validation, secret boundaries, and fail-closed trade controls. Run relevant tests and build before reporting success.
7. If build or tests fail, stop. Do not deploy, merge, or claim production readiness.
8. Prefer a dedicated branch and pull request for changes unless the user explicitly authorizes direct main commits. Never silently bypass branch protections.

## Trading mode and authorization
- Testnet/Demo is mandatory by default for all broker connectivity and trade testing.
- Real-money trading is prohibited unless the user explicitly types the exact phrase: "ใช้เงินจริงได้".
- That phrase alone does not waive code review, risk controls, broker/platform requirements, or production gates. Ask for confirmation of the exact scope before any consequential live-trading enablement.
- Never switch account mode, enable orders, or submit a real order as part of an ordinary API integration or deployment task.
- Preserve read-only mode when the existing system is read-only. Test with mocks, sandbox, or broker Demo/Testnet.
- Report any order submission, withdrawal, transfer, or live-trading capability as disabled unless independently proven otherwise.

## Required response format after every task
Always report:
1. **อ่าน Repo เจออะไร** — repository, branch, exact main SHA, relevant architecture/files, and scope inspected.
2. **API เชื่อมแล้ว / ยังขาดอะไร** — separate verified, unverified, missing, and intentionally disabled endpoints. Include exact route paths and backend owners.
3. **Env ที่ต้องเพิ่มใน Netlify** — exact variable names only, purpose, secret/public classification, and whether already represented in `.env.example`. Never reveal values.
4. **Build/Test/Deploy status** — commands or checks actually run and their results. Clearly mark NOT RUN when not run; never infer a successful deploy.
5. **Safety status** — Demo/Testnet or Read-only state; explicitly confirm real-money trading remains OFF unless authorized.

Use Thai status labels: DONE, IN PROGRESS, BLOCKED, STALE/OBSOLETE. Distinguish facts, assumptions, and recommendations. Never report success without evidence.
