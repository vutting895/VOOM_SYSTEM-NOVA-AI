# NOVA Path Standard and Repository Inventory

**Review date:** 2026-10-31  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Inventory ref:** `main`  
**Inventory commit:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Status:** Documentation proposal; implementation and path migrations are not authorized by this document.

## 1. Purpose and authority

This document records the paths actually present in the canonical repository and defines a conservative target convention for future work.

- `main` is the source of truth. This inventory is a snapshot of the exact commit above, not a statement about unmerged branches, local files, hosted resources, or deployed runtime.
- Existing paths are retained. Do not move, rename, delete, or consolidate files based only on this proposal.
- A path is **implemented** only when it exists on the inspected `main` tree and its implementation is supported by source/tests. A path in an open PR is **proposed / branch-only**. A path described below as a target is **not implemented** until merged and verified.
- Do not create another Integration Hub, AI gateway, Vault Worker, MT5 proxy, or duplicate frontend.
- This is an architecture and documentation change only. It does not authorize a migration, secret change, Worker deployment, hosting cutover, database change, customer onboarding, or trading capability.

## 2. Inventory method and snapshot

The inventory was read from GitHub's recursive Git tree for the exact `main` commit `a2acfd8ec9b598e6593413549bef760e8f596a72`. The counts below are tracked file/blob counts under each prefix at that commit; they do not include directories as files, ignored files, runtime files, provider-side resources, or unmerged PR content.

| Repository area | Tracked files | Observed role |
|---|---:|---|
| `frontend/app/` | 25 | Next.js pages and API route handlers |
| `integrations/` | 58 | Cloudflare Workers, MCP, MT5 Bridge / Relay / Proxy and retained source snapshot |
| `workers/` | 22 | Python research and quantitative prototypes |
| `shared/` | 4 | Intent and data-contract schemas |
| `supabase/` | 5 | SQL migrations and verification SQL |
| `infra/` | 5 | Cloudflare, Docker Compose, Kubernetes and monitoring notes |
| `docs/` | 11 | Delivery, architecture, implementation and research documents |
| `tests/` | 15 | API, security, migration, worker and research tests |
| `tools/` | 3 | Windows Bridge bootstrap and route provisioning helpers |

The repository also contains root configuration and documentation such as `README.md`, `netlify.toml`, `.env.example`, `BROKER_SETUP.md`, and `.github/workflows/`.

## 3. Actual paths on main

### 3.1 Customer frontend

The single Next.js application root is `frontend/`. The current page routes found in `frontend/app/` are:

| Page path | Current route |
|---|---|
| `frontend/app/page.jsx` | `/` |
| `frontend/app/login/page.jsx` | `/login` |
| `frontend/app/auth/callback/page.jsx` | `/auth/callback` |
| `frontend/app/command-center/page.jsx` | `/command-center` |
| `frontend/app/chat/page.jsx` | `/chat` |
| `frontend/app/gen-ai/page.jsx` | `/gen-ai` |
| `frontend/app/markets/page.jsx` | `/markets` |
| `frontend/app/learning-universe/page.jsx` | `/learning-universe` |
| `frontend/app/strategies/page.jsx` | `/strategies` |
| `frontend/app/backtest/page.jsx` | `/backtest` |
| `frontend/app/broker/page.jsx` | `/broker` |
| `frontend/app/settings/broker/page.tsx` | `/settings/broker` |
| `frontend/app/profile/page.jsx` | `/profile` |
| `frontend/app/marketplace/page.jsx` | `/marketplace` |

Shared presentation and client state are currently under `frontend/components/`, `frontend/lib/`, and `frontend/stores/`. Keep the existing app and navigation as the canonical customer frontend; do not merge a separate chat application to create another frontend.

### 3.2 Actual Next.js API route handlers

The current `frontend/app/api/` handlers are:

| Source path | Public path | Inventory note |
|---|---|---|
| `frontend/app/api/chat/route.js` | `/api/chat` | Authenticated chat proxy to the NOVA AI Worker; validates the fixed intent envelope and redacts credential-like text before forwarding |
| `frontend/app/api/backtest/route.js` | `/api/backtest` | Authenticated bounded backtest request |
| `frontend/app/api/broker/status/route.js` | `/api/broker/status` | Broker status / Exness Demo request path; public-market checks do not prove a customer's account connection |
| `frontend/app/api/gen-ai/generate/route.js` | `/api/gen-ai/generate` | Strategy draft route |
| `frontend/app/api/agent/threads/route.js` | `/api/agent/threads` | Agent thread route |
| `frontend/app/api/agent/threads/[threadId]/approvals/route.js` | `/api/agent/threads/:threadId/approvals` | Thread approval route |
| `frontend/app/api/agent/approvals/[approvalId]/decision/route.js` | `/api/agent/approvals/:approvalId/decision` | Approval decision route |

The presence of a route handler does not establish hosted authentication acceptance, persistence guarantees, tenant isolation, or production availability. Use the handler and its tests as the method/auth source of truth; do not infer methods from the path name alone.

### 3.3 Existing integration services

| Existing source path | Role / boundary |
|---|---|
| `integrations/system-hub/` | Canonical customer/provider control plane; Worker name is `voom-system-hub` |
| `integrations/nova-ai-worker/` | Authenticated NOVA AI / research Worker; not a credential store |
| `integrations/remote-mcp-worker/` | Primary Remote MCP Worker |
| `integrations/mt5-readonly-proxy/` | Authenticated, tenant-scoped read-only MT5 proxy |
| `integrations/mt5-bridge-relay/` | Cloudflare relay for tenant-specific outbound Windows Bridge connections |
| `integrations/mt5-readonly-bridge/` | Windows-hosted read-only MT5 Bridge runtime |
| `integrations/nova-ai-mcp-full-clean/` | Retained older/prototype source snapshot; do not treat as a second active control plane or delete before import/reference/deployment inventory |

The current System Hub Worker implements these route families in source:

- `GET /health`
- `GET /v1/integrations`
- `GET|POST /v1/connections`
- `GET /v1/connections/:connectionId/status`
- `POST /v1/connections/:connectionId/check`
- `GET /v1/connections/:connectionId/account`
- `GET /v1/connections/:connectionId/quotes`

The current NOVA AI Worker accepts `GET /health` and the supported `/api/marketplace`, `/api/gen-ai/generate`, `/api/chat`, and `/api/backtest` paths. The exact method and authorization contract must remain defined by its Worker source and tests.

The MT5 Proxy allowlist contains only `/health`, `/api/account`, `/api/symbols`, and `/api/quotes`. The Remote MCP Worker exposes `GET /health`, `POST /mcp`, and `GET /api/status` in its current router. Do not introduce arbitrary upstream URL forwarding or order-like routes.

### 3.4 Existing quantitative and research prototypes

The tracked `workers/` paths on main are:

- `workers/data-ingestion/`
- `workers/feature/` (including `workers/feature/smc_wave/`)
- `workers/gen-ai/`
- `workers/backtest/`
- `workers/tuning/`
- `workers/risk/`
- `workers/portfolio/`
- `workers/execution/`

These contain Python files with names such as `main_prototype.py`, `engine_prototype.py`, `smc_strategy.py`, `optuna_tuner_prototype.py`, `manager_prototype.py`, and `allocator.py`. Treat these as existing prototype/research modules according to their README and tests; their presence does not mean a production Quant Engine pipeline is deployed.

The `workers/execution/` directory is retained but execution remains disabled. Its existence must never be used to imply that order submission or trading is available.

### 3.5 Shared contracts, data and persistence

| Path | Current content / use |
|---|---|
| `shared/nova-intent-envelope.schema.json` | Data-only NOVA intent contract |
| `shared/schemas/market-event.schema.json` | Market event schema |
| `shared/schemas/risk-decision.schema.json` | Risk decision schema |
| `shared/feast/` | Feature-store contract/documentation |
| `supabase/migrations/` | Versioned SQL migrations |
| `supabase/verification/` | Read-only verification SQL |

Current tracked migration files include the Alpaca historical migration, MT5 customer connections, marketplace security hardening, and durable approval lifecycle. Do not edit historical migrations to retrofit a new path; introduce reviewed additive migrations only after schema, grants, RLS and rollback review.

### 3.6 Infrastructure, tests, workflows and runtime tooling

- Infrastructure: `infra/cloudflare/`, `infra/monitoring/`, `infra/k8s/`, and `infra/docker-compose.yml`.
- Windows runtime: `tools/windows/run-bridge-from-git.ps1`, `tools/windows/provision-mt5-relay-route.ps1`, and `tools/windows/README.md`.
- Security/API/research tests: `tests/`, plus service-local test files under `integrations/*/tests` or the service directory.
- Current GitHub Actions workflow paths: `.github/workflows/ai-worker-deploy.yml`, `cloudflare-deploy.yml`, `frontend-ci.yml`, `nova-approval-migration-ci.yml`, `smc-research-ci.yml`, and `windows-runtime-ci.yml`.
- Root `netlify.toml` and frontend Next/OpenNext configuration are deployment configuration files, not proof of current Production SHA or a successful hosted session.

Netlify remains the selected customer frontend host; Cloudflare Workers are the backend/edge service layer. Verify live project/deployment state independently. Do not use stale previews, CI alone, or legacy Vercel checks as Netlify Production evidence.

## 4. Unmerged path proposals — not part of main

At the time of this inventory, the following open Draft PRs propose paths that are not in the inspected main tree. They are listed to prevent accidental duplication or false implementation claims.

| PR | Proposed path(s) | Current interpretation |
|---|---|---|
| [#94](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/94) | `workers/quant_engine/`, `tests/test_quant_engine.py` | Candidate reusable Quant Engine foundation; open Draft, not on main |
| [#97](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/97) | `docs/QUANTITATIVE-INTELLIGENCE-DEEP-RESEARCH-CORE.md` | Deep Research architecture specification; open Draft, not on main |
| [#99](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/99) | `workers/deep_research/`, `tests/test_deep_research_contracts.py` | Contract implementation stacked on PR #97; not on main |
| [#100](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/100) | `workers/quantum/`, `tests/test_quantum_quant_engine.py` | Separate optional quantum research candidate; not the canonical Quant Engine path |
| [#95](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/95) | `docs/implementation/NOVA-DEDICATED-VAULT-ACCESS-DESIGN.md` | Vault access design only; no runtime secret endpoints or grants |

PR #98 is a Quant Engine contract hardening change stacked on PR #94. Its branch base is not main. Review stacked PR dependencies before proposing a merge sequence.

Do not copy any of these branch-only paths into main or create parallel implementations while their PRs are under review. Reconcile to the final merged shape after review, then update this inventory through a separate PR.

## 5. Canonical path conventions

1. **Existing path stability:** retain current paths unless a reviewed migration plan proves that a rename is worth the compatibility and deployment cost.
2. **Frontend route names:** lowercase kebab-case path segments; Next.js App Router source remains under `frontend/app/`.
3. **Frontend API facade:** browser-facing server handlers stay under `frontend/app/api/`; authenticate the session server-side before protected work and forward only bounded, validated payloads.
4. **Backend service ownership:** provider/broker control plane remains in `integrations/system-hub/`; adapters remain separate under their existing integration directories.
5. **Python import packages:** use valid Python package names (snake_case) for new packages, while preserving established hyphenated service directories. Do not rename current folders merely to normalize style.
6. **Shared contracts:** reusable JSON schemas belong in `shared/schemas/`; the existing top-level intent schema remains where it is until a reviewed reference migration exists.
7. **Database:** SQL migrations remain in `supabase/migrations/`; verification-only read queries remain in `supabase/verification/`.
8. **Docs:** architecture standards go in `docs/architecture/`; implementation/readiness/security details go in `docs/implementation/`; research results go in `docs/research/`.
9. **Tests:** put shared cross-component tests in `tests/`; keep Worker/adapter-specific tests beside the service they exercise when consistent with its current layout.
10. **Secrets/configuration:** never create credential files in frontend source, shared schemas, prompts, test fixtures, Git, or logs. Customer secrets remain server-side behind the approved existing System Hub access boundary.

## 6. Target paths for the next architecture milestones

The following are reserved design targets, not existing routes or a request to create them immediately.

### 6.1 Customer-owned Workspace

Target page family:

- `frontend/app/workspace/[workspaceId]/page.jsx`
- `frontend/app/workspace/[workspaceId]/research/page.jsx`
- `frontend/app/workspace/[workspaceId]/strategies/page.jsx`
- `frontend/app/workspace/[workspaceId]/backtests/page.jsx`
- `frontend/app/workspace/[workspaceId]/ai/page.jsx`
- `frontend/app/workspace/[workspaceId]/brokers/page.jsx`
- `frontend/app/workspace/[workspaceId]/settings/page.jsx`

Target server API family:

- `frontend/app/api/workspaces/route.js`
- `frontend/app/api/workspaces/[workspaceId]/route.js`
- `frontend/app/api/workspaces/[workspaceId]/research/route.js`
- `frontend/app/api/workspaces/[workspaceId]/threads/route.js`

These are not present on main. Do not create them until the workspace ownership schema, session-derived owner identity, RLS, durable thread semantics, and cross-user denial tests are specified.

### 6.2 Quantitative Intelligence & Research Engine

The intended logical boundary is:

- Quant Compute: deterministic ingestion, validation, features, chronological splits, backtesting, optimization and risk evaluation.
- Deep Research Core: source discovery, evidence/provenance, claims, falsifiable hypotheses, experiment specifications and report synthesis.
- Research Window: customer-facing workflow that starts/observes research runs and presents evidence; it is not a direct execution surface.

For implementation paths, prefer reconciling the candidate packages already proposed by PR #94 (`workers/quant_engine/`) and PR #99 (`workers/deep_research/`) after their dependencies and reviews are resolved. Do not instead create the earlier illustrative `workers/quant-engine/research/` tree, which would duplicate and conflict with the more specific package layout proposed in those PRs. Do not treat `workers/quantum/` from PR #100 as a replacement for the conventional Quant Engine; it is an optional research candidate.

Target API facade, not yet present:

- `frontend/app/api/research/route.js` or a versioned research API client under `frontend/lib/` (select one contract after reviewing current App Router patterns).
- Research execution must run in a bounded server-side compute environment, not in the browser and not implicitly inside the System Hub Worker.
- Research tasks, evidence and results require tenant-scoped persistence and provenance; no customer-private payload is sent to an AI provider without a documented data-minimization boundary.

### 6.3 Secret Manager and broker integrations

- Extend the existing `integrations/system-hub/` only after the dedicated Vault design, DB identity binding, narrow grants, caching, rotation, revoke and two-customer tests are accepted.
- Do not create `integrations/secret-manager-worker/`, a second gateway, or browser-accessible Vault routes.
- No customer credential lifecycle endpoint is currently authorized by this inventory. Any future API contract must be reviewed against PR #95 and remain server-only; no plaintext/decrypted secret may be returned to the browser, AI, MCP, logs or traces.
- Keep the MT5 Bridge → Relay → read-only Proxy → System Hub sequence. Do not move MT5 terminal execution into a shared Cloudflare Worker.
- Add IBKR or CCXT provider routes only after each provider has an isolated read-only adapter, server-side credential handling, capability allowlists and tenant-isolation tests.

## 7. API path versioning and security contract

- Existing browser-facing Next.js paths use `/api/...`; existing System Hub provider/control-plane paths use `/v1/...`. Preserve both boundaries rather than exposing Worker internals to the browser.
- A protected request must derive its user identity from a verified Supabase session. Client/model-supplied `user_id`, `tenant_id`, route IDs, hostnames, ports and upstream URLs are not authorization evidence.
- Resolve workspace, connection, provider, environment, capability and consent on the server for every request. Use RLS and explicit denial tests, not frontend filtering.
- Reject unknown paths and methods. No generic `/proxy?url=` endpoint, no order routes, and no dynamic arbitrary provider host.
- Use no-store semantics for private responses where appropriate; bound payload size, provider timeout, retry count and response fields. Never return raw upstream errors or secrets.
- `GET /health` indicates process/readiness status only. It is not proof of a broker account, customer-owned connection or data freshness.
- The current product posture stays Exness Demo / Read-only + AI Analysis; `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.

## 8. Safe change and acceptance workflow

For every new path or path migration:

1. Re-read current `main` and the relevant directory tree immediately before editing.
2. Search imports, route handlers, package manifests, tests, build/workflow path filters, Wrangler bindings, Netlify settings and documentation references.
3. Classify the proposed path as existing, branch-only, new, legacy-retained, or removal candidate. Record its owner and contract.
4. Prefer additive changes. Do not rename/delete or create a duplicate service while the existing consumer/deployment inventory is incomplete.
5. Implement on a feature branch based on the exact inspected `main` SHA; open a Draft PR with dependencies, path list, tests and non-effects.
6. Require exact-head CI and relevant code/security review. Documentation-only CI skips must be described accurately.
7. Merge only after owner review/approval. Do not deploy, change hosted configuration or activate a customer route merely because the PR merged.
8. Update this inventory on a later reviewed PR when paths actually change on main.

### Acceptance checklist for this inventory

- [x] Repository and canonical `main` ref verified.
- [x] Recursive file tree inspected at the recorded SHA.
- [x] Existing Frontend, API, Integration, Worker, Shared, Supabase, Infra, Docs, Tests and Tools paths inventoried.
- [x] Open PR paths separated from the main inventory.
- [x] Customer Workspace, Quant/Research and Secret Manager future paths explicitly marked as targets.
- [x] No existing source path moved or deleted.
- [x] No runtime code, database, secret, hosting, route, deployment or trading flag changed.
- [ ] Review this document and confirm the target conventions before implementation work begins.

## 9. Known limitations

This is a Git path inventory, not a full software bill of materials, deployment inventory, runtime dependency graph, database schema audit, or consumer/secret scan. Before implementation of any service path, inspect the exact files, package imports, workflow filters, provider bindings and relevant tests on the candidate branch. Hosted provider configuration and live customer behavior require separate evidence.
