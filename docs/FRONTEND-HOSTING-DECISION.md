# Frontend Hosting Decision — NOVA

**Decision date:** 2026-10-29  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Source of truth:** `main`

## Decision

Keep **Cloudflare Workers** as the canonical production frontend host for NOVA. Do not switch production to Netlify or Vercel as part of this change.

## Evidence and rationale

- The repository's current `.github/workflows/cloudflare-deploy.yml` builds and deploys the frontend when `frontend/**` changes, then smoke-tests `/` and `/settings/broker`.
- The latest baseline recorded in Issue #57 is commit `2cbfc27734e22ecba49242e8227fc8544c5e7aa8`; the linked Frontend CI and Cloudflare deployment runs succeeded for that commit.
- PR #54 proposes a Netlify build configuration, but its verification notes report that `https://voomsystem.netlify.app/` returned HTTP 404. The repository config alone cannot establish that the Netlify site is connected to this repository or that a production deploy is serving the reviewed commit.
- Main's README and workflow history were inconsistent about Cloudflare versus Vercel. This decision aligns docs with the existing Cloudflare workflow and prevents a config-only change from being mistaken for a cutover.

## Netlify evaluation gate

PR #54 remains an alternative-host proposal until all of the following are evidenced:

1. Netlify site is connected to this repository and tracks `main`.
2. Its production build uses the repository's reviewed `netlify.toml` and deploys the expected commit.
3. Live `/` and `/settings/broker` routes return HTTP 200 and render correctly.
4. Supabase login, callback, session persistence, logout, and authenticated account UI are tested against that exact deployment.
5. The owner-session / cross-user connection isolation tests pass independently.
6. A separate, reviewed cutover change updates any required Supabase Site URL, redirect allow-list, docs, and monitoring. No DNS/auth redirect changes happen before the candidate passes.

Until then, Netlify may be evaluated as a separate candidate but is not production authority. Vercel is not the target.

## Safety and rollback

- Keep the current Cloudflare production frontend and Windows MT5 Bridge unchanged while evaluating alternatives.
- Preserve the existing Windows development worktree; it may contain uncommitted/untracked files and must not be reset or overwritten.
- Keep Exness Demo in **Read-only + AI Analysis** mode. Keep Live Trading, order submission, and all broker mutations disabled.
- A successful deployment/route smoke test is not proof of a live authenticated broker read. Supabase owner-session and foreign-connection denial are separate acceptance gates.
