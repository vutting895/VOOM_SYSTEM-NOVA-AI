# NOVA Main Dashboard — Adaptive Design and Delivery Plan

**Status:** Dashboard implementation is in PR #146 (ready for review); Workforce P1 UI is in PR #148 (ready for review, stacked on #146). Neither implementation PR is merged to `main`.  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base:** `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Primary frontend:** `frontend/` (Next.js; Netlify target)  
**Master delivery tracker:** Issue #36  
**Related product scope:** Issue #57 (Zero-Menu / Intent-Driven Dashboard), Issue #82 (customer workspaces)

## 1. Product priority

The NOVA Main Dashboard at `/` is the primary product surface and the first frontend priority. The Adaptive Design Engine exists to keep this dashboard and its connected workspaces consistent as backend capabilities, modules, routes, APIs and customer entitlements evolve.

Product rule: **one NOVA application, one design language, one module registry, one primary dashboard entry point**. Do not create a second dashboard product or duplicate navigation.

## 2. Dashboard responsibility model

### Main Dashboard — `/`
The main Dashboard is the system-wide command surface. It should answer, at a glance:

1. What is the current system and service health?
2. Which data sources are verified, stale, unavailable or awaiting setup?
3. What research/AI tasks and approvals need attention?
4. Which modules are available to this signed-in user?
5. What is the safe next action?

The dashboard is a composition of reusable, permission-aware widgets, not a separate implementation of every module's business logic.

### Customer Command Center — `/command-center`
Retain the existing authenticated customer workspace while it is needed. Treat it as a focused personal workspace that is reachable from the main Dashboard, not a competing global Dashboard. Preserve its owner-scoped session, strategy preference, chat, approvals and data boundaries. Do not merge, redirect, rename or delete this route until route usage, auth behavior, deep links and tests have been reviewed.

### Module workspaces
Markets, AI Chat, AI Analysis, Backtest, Learning Universe, Broker Hub, Marketplace and future modules remain domain workspaces. They reuse the shared shell, tokens and component contracts; they do not create their own global navigation.

## 3. Baseline findings on main

- `frontend/app/page.jsx` currently owns a bespoke JARVIS-style sidebar and a separate local navigation array.
- `frontend/app/layout.jsx` also renders `NovaNavigation`, which owns another global navigation. This creates competing navigation ownership and inconsistent active-route behavior.
- `frontend/components/nova-navigation.jsx` contains a wider route catalog than the root Dashboard's local list.
- The main Dashboard currently contains a decorative chart path and static watchlist, both labelled unverified/illustrative. Keep those labels until a validated market-data adapter provides real candles and freshness metadata.
- The broker card queries the existing authenticated status API but its visual monogram currently reads `XM` while its title says Exness. Correct brand identity to Exness only when displaying the actual configured provider; do not infer account connectivity from a label.
- Broker, portfolio, risk, activity and strategy data have different readiness states. The Dashboard must not manufacture metrics or turn unavailable data into zero.
- `frontend/components/widgets/README.md` already requires presentational widgets backed by typed server-side adapters. Extend this convention rather than introducing a parallel widget system.
- The existing `/command-center` is authenticated and owner-scoped, and intentionally hides global navigation. Preserve that security boundary.

## 4. Target information architecture

### Main shell
- Shared responsive navigation with one source of truth.
- Brand and environment identity.
- Global safe-mode indicator: Read-only + AI Analysis; Order Submission OFF; Live Trading OFF.
- Context-aware module navigation generated from the trusted module registry and filtered by server-authorized capabilities.
- Profile/session controls.
- Accessible mobile navigation and keyboard operation.

### Main Dashboard sections

1. **System Overview** — service health, environment, last verified update and actionable incidents.
2. **AI Command Surface** — entry to NOVA AI Chat, research tasks and approved quick actions; no arbitrary model-generated UI.
3. **Market Intelligence** — verified watchlist and charts only when source, symbol, timeframe and freshness are known; otherwise a clear unavailable/awaiting-feed state.
4. **Broker Connections** — provider, environment (Demo), connection lifecycle state, last verification time and permitted read-only capabilities; never expose credentials or account identifiers.
5. **Research & Strategy** — catalog readiness, active research runs, evidence-backed outcomes and pending human reviews. Draft/research status must not be presented as production readiness.
6. **Risk & Safety** — explicit execution lock and verified risk data only. No synthetic equity, margin, PnL or drawdown.
7. **Workspace Shortcuts** — modules visible only when the user is authorized and the capability is enabled.
8. **Recent Activity** — only sanitized, source-labelled events; distinguish local UI activity from server audit events.

### Layout behavior
- Desktop: responsive 12-column grid with prioritized overview and AI actions; lower-priority panels can collapse/reorder within bounded layout rules.
- Tablet: two-column composition with navigation collapse.
- Mobile: single-column priority order, compact header and accessible navigation drawer.
- Support loading, empty, stale, unavailable, error, permission-denied and verified states for every data widget.

## 5. Adaptive Design Engine contracts

Use versioned declarative metadata. Do not generate JSX, HTML, CSS, JavaScript, SQL or routes from model output.

### Module manifest (conceptual)
```json
{
  "schema": "nova.module.v1",
  "id": "research.deep",
  "version": "1.0.0",
  "label": "Deep Research",
  "route": "/research",
  "navigationGroup": "intelligence",
  "requiredCapabilities": ["research.read"],
  "pageTemplate": "research-workspace",
  "widgetIds": ["research.status", "research.queue"],
  "status": "planned"
}
```

The trusted server-side registry is authoritative for module identity, route, lifecycle, dependencies and capability requirements. The browser receives only a sanitized, allowlisted view model.

### Widget contract
Each widget declares:
- Stable widget ID and schema version.
- Data adapter/API contract and source provenance.
- Required capabilities.
- Supported layout breakpoints and size constraints.
- Loading/empty/stale/unavailable/error states.
- Refresh policy and freshness threshold.
- Accessibility label and test identifier.

Widgets remain presentational. Data fetching, authorization and tenant scoping stay in server-side adapters/APIs. Never let a widget query Supabase directly with elevated privileges or choose a tenant/connection ID from model output.

### Design tokens and component registry
Maintain shared semantic tokens for color, typography, spacing, radius, elevation, focus, motion and breakpoints. Components use semantic tokens rather than per-page hard-coded colors. Existing visual identity should be retained and consolidated; do not introduce a wholesale redesign without visual review.

### Change detection and compatibility
- Detect manifest/API/schema changes in CI.
- Identify affected routes, widgets and tests.
- Reject unknown widget IDs, unsupported manifest versions and missing capability declarations.
- Apply additive compatibility rules; breaking contract changes require explicit versioning and migration.
- Generate a proposed impact report and PR changes; never rewrite production UI automatically.

## 6. Dashboard data truth model

Use explicit states, not ambiguous booleans:

- `not_configured`
- `pending`
- `checking`
- `reachable`
- `authenticated`
- `identity_verified`
- `data_verified`
- `stale`
- `degraded`
- `unavailable`
- `error`

Only show a connected/verified state when the authoritative API response includes the required provider identity, owner scope, data provenance and verification timestamp. A successful anonymous health response or a configured route is not proof of a customer's connection.

Market and account widgets must show source and as-of time. Do not silently convert missing data to zero. Demo and live environments must be visibly distinct.

## 7. AI-assisted design workflow

1. Discover repository routes, module manifests, component registry, API contracts and current design tokens.
2. Compare changes against the canonical `main` baseline.
3. Produce an impact map: affected dashboard sections, widgets, routes, permissions and tests.
4. Propose a design/layout diff using only approved components and templates.
5. Implement on a feature branch; keep generated code reviewable and deterministic.
6. Run typecheck, lint where configured, unit/contract tests, production build, route smoke tests and visual regression checks.
7. Open a PR with screenshots, changed routes, contract versions, test evidence, risks and rollback notes.
8. Require human review and exact-head CI before merge. Production deploy remains a separate approval gate.

AI must not change authorization, RLS, tenant routing, broker capabilities, execution flags or provider secrets as a side effect of a design update.

## 8. Delivery phases

### D0 — Baseline and dashboard audit
- Confirm exact main SHA, open PR dependencies and existing frontend tests.
- Inventory routes, root layout, navigation, dashboard CSS, widget contracts and data adapters.
- Record dashboard screenshots at desktop/tablet/mobile breakpoints.
- Identify every duplicated nav owner and hard-coded module list.
- No destructive changes.

### D1 — Main Dashboard shell consolidation (implemented in PR #146; review pending)
- The root Dashboard now uses the shared global navigation instead of a competing page-local sidebar.
- `/` has a responsive command-dashboard layout with workspace shortcuts and explicit unavailable market-data states.
- The existing `/command-center` route remains unchanged and owner-scoped.
- Exness / MT5 Demo presentation is corrected without changing broker runtime configuration.
- Exact-head Frontend CI passed and the Netlify Preview is ready; human review remains required.

### D2 — Widget and module registry
- Introduce typed, versioned module/widget manifests.
- Convert Dashboard panels to reusable presentational widgets.
- Add explicit widget states and source/freshness metadata.
- Build module visibility from trusted capabilities, not client-supplied role or model output.

### D3 — Dashboard intelligence
- Add evidence-backed system/service status and research/approval summaries through existing APIs.
- Integrate market data only after validated candle contracts and freshness checks exist.
- Keep unavailable account/risk metrics visibly unavailable until owner-scoped sources are verified.

### D4 — Adaptive composition
- Add deterministic layout templates and breakpoint rules.
- Detect module/API contract changes in CI and report impacted widgets/routes.
- Allow AI to propose composition changes, never auto-publish them.

### D5 — Verification and release
- PR #146 exact-head Frontend CI passed and Netlify Preview is ready for review.
- PR #148 exact-head Frontend CI passed; its Netlify Preview is not yet available because it is stacked on #146 and no exact-head Netlify deploy/check has been produced.
- Human visual review at desktop/tablet/mobile and any required accessibility/route checks remain open.
- Do not release to Production until exact-head evidence, human approval and the canonical delivery plan's release gates are satisfied.

## 9. Acceptance criteria

- The main Dashboard at `/` is the primary entry point and has exactly one global navigation owner.
- Every existing module route remains reachable through the shared information architecture, subject to authorization.
- `/command-center` remains authenticated and owner-scoped; no duplicate dashboard or accidental exposure is introduced.
- All dashboard widgets use shared design tokens and typed, allowlisted contracts.
- No model-generated executable markup or arbitrary component selection is rendered.
- Every dynamic data value has source/provenance and freshness or is clearly marked unavailable.
- No fabricated broker status, prices, chart candles, equity, PnL, margin or risk metrics.
- Desktop, tablet and mobile layouts pass responsive and accessibility checks.
- Frontend typecheck, relevant tests, production build and exact-head Netlify Preview pass.
- A reviewed PR contains screenshots and evidence; no direct push to `main`, automatic merge or unapproved production deploy.

## 10. Non-negotiable safety constraints

- Exness Demo only for the current broker integration.
- Read-only + AI Analysis.
- `order_submission_enabled=false`, `execution_enabled=false`, and Live Trading OFF.
- No order placement, position mutation, withdrawal, transfer or broker write controls.
- Supabase remains on Free unless the owner separately approves a plan change.
- Netlify remains the selected customer-facing frontend; Cloudflare Workers remain backend/proxy. Do not change DNS, provider settings, secrets or production deployments in this workstream.
- Follow `docs/NOVA-DELIVERY-VERIFICATION-ACTIVATION-PLAN.md`; master tracking remains Issue #36.
