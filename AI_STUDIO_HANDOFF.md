# Google AI Studio Frontend Handoff — VOOM_SYSTEM-NOVA-AI

## Purpose
Google AI Studio Build Mode is the UI authoring environment. GitHub is the source of truth. Backend and platform services remain maintained separately.

## Work area
- Primary application: `frontend/` (Next.js App Router, React, TypeScript).
- UI work includes pages, components, styling, responsive behavior, accessibility, charts and presentation-only state.
- Keep changes inside `frontend/` unless a maintainer explicitly approves a cross-boundary change.

## Backend boundary — do not modify
- `workers/`, `integrations/`, `infra/`, `tools/`, database migrations, Supabase policies, Cloudflare Worker configuration, Netlify configuration and deployment workflows.
- Do not change authentication, authorization, tenant isolation, RLS, broker adapters, risk controls, secrets, environment files or API contracts.
- Never add API keys, tokens, credentials or private customer data to source code, prompts, commits or browser bundles.
- Do not create trading execution or order-submission UI. Product safety mode remains read-only + AI analysis; Live Trading and order submission stay disabled.

## API integration rules
- Reuse existing typed frontend service/API clients and documented endpoints.
- Do not invent endpoints, payload fields, response schemas or mock success states.
- If a UI feature needs a missing endpoint or schema, add a clearly labelled TODO/spec proposal and report the required backend contract; do not implement backend changes.
- Keep secrets server-side. Browser code may use only explicitly public configuration values.

## Git workflow
1. Work only on the dedicated branch `chore/google-ai-studio-frontend-handoff` or a new feature branch created from the latest reviewed base.
2. Never push directly to `main`, force-push, merge a PR or deploy.
3. Before syncing, pull the latest branch and inspect the diff. Never overwrite newer GitHub commits to resolve divergence.
4. Keep commits focused on frontend files. Open a PR for review.
5. Report changed files, screenshots/preview, build and typecheck results, and any unverified behavior. Do not claim checks passed unless they ran successfully.

## Project runtime
- Frontend: Next.js 15 / React 19 / TypeScript.
- Current public frontend: Netlify (`https://voomsystem.netlify.app/`).
- Backend: Cloudflare Workers/APIs.
- Auth and data: Supabase.
- Broker path: Exness Demo read-only through authenticated, tenant-scoped services.
- Do not deploy from AI Studio or change production hosting/DNS.
