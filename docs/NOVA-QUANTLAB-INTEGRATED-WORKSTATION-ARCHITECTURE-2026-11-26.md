# NOVA QuantLab — Integrated Workstation Architecture & Existing-System Audit

- Date: 2026-11-26
- Decision: **A — Integrated Workstation**
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`
- Work branch: `dev/nova-quantlab-integrated-workstation-20261126`
- Status: architecture and repository-source audit; no implementation or runtime verification claimed
- Cost policy: zero-cost-first; no paid services, subscriptions, or new billable resources
- Trading safety: research/read-only only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## 1. Decision and product definition

NOVA QuantLab is the quantitative engineering workspace embedded in the NOVA Integrated Workstation. It is one coherent application and navigation model, not a second frontend or a collection of disconnected dashboards. Its research, strategy, model, evaluation, evidence, and operational views share one identity, one navigation shell, common contracts, and a single audit trail.

The workstation is an engineering/research product. It does not itself grant trading authority. Research approval, model approval, and broker execution permission are three separate concepts. This phase implements none of them.

## 2. Verified repository baseline

The following are source-level observations from the specified Main SHA. They do not prove deployed runtime behavior.

| Area | Main evidence | Audit finding |
|---|---|---|
| Command Center app | `apps/nova-command-center`, TanStack Start / React / Vite / TypeScript; authenticated routes for dashboard, assistant, bridge, risk, approvals, logs, settings, trading | Best candidate for the integrated workstation shell; confirm build and runtime before changing it |
| Trading page | `apps/nova-command-center/src/routes/_authenticated/trading.tsx` | Explicitly read-only; uses `DEMO_*` fixtures; states no order entry exists. It is not a live market terminal |
| App safety contract | `apps/nova-command-center/README.md` and safety tests | States Live Trading OFF, broker writes OFF, GET-only API and fail-closed behavior |
| Quant Engine | `workers/quant_engine/*`, `backend/quant_engine.py`, `docs/INTERNAL-QUANT-ENGINE-ARCHITECTURE.md` | Multiple generations coexist. The workers package has useful deterministic contracts; the backend quantum-labelled implementation requires independent scientific and numerical validation |
| Model training | `workers/quant_engine/training.py`, `torch_models.py` | Training utility returns literal mock checkpoint bytes; Torch model is ResidualMLP, not LSTM. Must not be presented as real LSTM training |
| Meta Decision | `workers/quant_engine/meta_decision.py` | Research-only, fail-closed contract exists; uses fixed equal base weights and requires OOS calibration evidence. This is not evidence of trained/calibrated model performance |
| MCP | `integrations/remote-mcp-worker` and MCP-related branches/PRs | A bounded authenticated research tool surface exists in source; runtime capability and integration coverage need separate verification |
| System Integration Hub | `docs/SYSTEM-INTEGRATION-HUB-DESIGN.md` | Target control-plane contract exists; docs do not prove the Hub is deployed or fully implemented |
| Quant research UI | Root `src/components/*`, including Backtest, Strategy, Learning, Intelligence and Quantum views | Legacy/root UI and the authenticated Command Center app coexist. Do not assume these views are wired into the current Command Center |
| Data and artifacts | `colab/`, `notebooks/`, `NOVA_XAUUSDm_ML_Backtest`, dataset and export PRs | Source and notebook artifacts exist; eligible immutable market data and a verified export handoff are not established by this audit |

## 3. Existing work and overlap control

Do not duplicate or silently absorb these active workstreams:

- PR #403 — architecture-documentation and service-boundary audit. Use it as the broad documentation baseline; it is not a full runtime audit.
- PR #421 — multimodel evaluation-readiness audit. Its findings include absent eligible historical OHLCV/MT5 export evidence, synthetic/random XGBoost feature concerns, mock training checkpoint, MLP-not-LSTM mismatch, and missing immutable NOVA Brain replay ledger.
- PR #422 — Unified Intelligence & Validation Engine. It proposes the separate research/evaluation path for XGBoost, genuine LSTM, canonical SMC and immutable Brain replay; training remains blocked pending eligible data and receipts.
- PR #302 — 30-module MTRADERS hybrid research engine. Its own PR description says the checked-in EA source contains module names/registration and an intentionally empty OnTick; the 30 strategies are newly authored research baselines, not faithful extraction of the original EA logic.
- PRs #382/#386/#397/#398 and related MCP branches — gateway/runtime ownership and legacy MCP isolation. Resolve these before adding another MCP gateway.
- PR #384 and PR #383 — registry/dashboard and XGBoost learning-orchestrator work. Reuse contracts only after review; do not create parallel registries or orchestrators.
- PR #370 and PR #319/#305 — analysis/trading Meta Decision architecture and fail-closed meta-decision work. Reconcile contracts rather than introduce a second decision engine.

The above are open PR snapshots at audit time. Their contents and branch heads may change; re-fetch exact heads before any future integration.

## 4. Integrated Workstation target architecture

```text
NOVA Integrated Workstation (single authenticated application)
  |
  +-- Overview / Command Center
  +-- Research Studio
  |     +-- Market Data & Dataset Quality
  |     +-- Strategy Factory / Strategy Registry
  |     +-- Model Lab (XGBoost, LSTM, DL, Vision, SMC adapters)
  |     +-- Experiment & Backtest Lab
  |     +-- Evaluation / OOS / Walk-forward reports
  |     +-- Model & Artifact Registry
  +-- NOVA Brain / AI Assistant
  +-- Evidence & Governance
  |     +-- Approvals (research/model promotion only)
  |     +-- Audit Trail / Run Lineage
  +-- Broker & Risk Monitor (read-only)
          |
          v
  Typed frontend API client
          |
          v
  NOVA System Integration Hub (auth, tenant ownership, routing, policy)
          |
          +--> Dataset / Datacenter API (approved, immutable, bounded reads)
          +--> Quant Job API (job metadata and status only)
          +--> MCP Gateway (allowlisted tools; no duplicate gateway)
          +--> MT5 read-only proxy / relay (market/account history only)
                         |
                         v
             Isolated Python Quant Worker
             - validate dataset + provenance
             - point-in-time feature generation
             - strategy/model plugins
             - chronological/purged evaluation
             - metrics + immutable artifacts
                         |
                         v
             Run Registry + Artifact Store
             - metadata / ownership / state
             - content hashes / provenance
             - reports / model artifacts
```

### Responsibility boundaries

1. **Workstation UI** owns navigation, visualization, user input, and status presentation. It never authorizes a tenant or decides execution permission.
2. **System Integration Hub** is the sole integration control plane: authentication, tenant/resource ownership, route allowlists, rate limits, idempotency and sanitized audit events.
3. **Quant Job API** validates typed job requests and creates bounded job metadata. It does not perform long-running model training inside a Worker request.
4. **Python Quant Worker** is the isolated compute plane. It consumes immutable dataset/run references and returns evidence artifacts. It has no broker-write credentials or order-submission API.
5. **MCP Gateway** exposes only explicitly approved typed tools. It is not a second control plane and cannot bypass Hub authorization.
6. **MT5 adapter** remains read-only. It provides verified market/account history only; no trade, position, withdrawal, transfer, or account mutation methods.
7. **Deterministic Risk Policy** remains authoritative and separate from all AI/model outputs. The current phase cannot change risk policy or execution flags.

## 5. Integrated Workstation information architecture

The single application should expose these top-level workspaces:

| Workspace | Core views | Required evidence/status |
|---|---|---|
| Command Center | system health, data freshness, active experiments, model status, risk status | distinguish configured/reachable/authenticated/data-verified; no fake green status |
| Research | symbols, timeframes, sessions, datasets, quality receipts | source, UTC range, checksum, gaps, duplicates, approval |
| Strategies | Strategy Factory, version history, parameters, eligibility | immutable strategy version, code SHA, research-only status |
| Models | XGBoost, LSTM, deep learning, vision, SMC adapters, Brain replay | actual model class, artifact hash, training status, calibration evidence |
| Experiments | backtest, walk-forward, Monte Carlo, sensitivity | dataset/code/config SHA, costs, seeds, fold boundaries |
| Evaluation | OOS, baselines, metrics, regime breakdown, drift | sealed OOS, sample counts, uncertainty, cost completeness |
| Brain & Agents | research chat, bounded agent tasks, tool activity | prompt/model/version provenance, tool permissions, replayability |
| Evidence & Approvals | run evidence, review, candidate lifecycle, audit events | reviewer, decision, timestamp, evidence links |
| Broker & Risk | Demo connection, read-only account/market data, policy telemetry | authenticated source and explicit read-only state |

A user should be able to move from a strategy to its model versions, dataset, experiment runs, OOS report and approval record without leaving the workstation.

## 6. Canonical data and experiment flow

1. Discover a source through the existing authorized NOVA data path.
2. Ingest raw data with provider, broker symbol, timeframe, UTC range, source order, session calendar and immutable source reference.
3. Validate OHLCV, tick volume/spread where available, duplicates, ordering, impossible values, gaps and session/rollover boundaries. Missing bars are reported, never fabricated.
4. Create an immutable dataset manifest and content SHA-256. Only an explicitly approved quality receipt can make a dataset eligible for training.
5. Generate point-in-time features with event-time and availability-time lineage.
6. Run each base strategy/model independently with frozen code, config, seed and chronological folds.
7. Generate development-only OOF predictions for the meta layer. Fit calibration and fusion only within permitted development folds.
8. Evaluate the sealed final OOS once, after all choices are frozen. Use identical fills and complete cost assumptions across candidates.
9. Persist every run, including failed/rejected runs, metrics, warnings, logs and artifact hashes.
10. Present the result as research evidence. Human research/model approval is not broker execution permission.

Reuse the existing `nova.dataset.v1`, `nova.quant-run.v1` and `nova.quant-experiment.v1` contracts where verified. Do not invent a parallel schema before checking compatibility with the active registry PRs.

## 7. Model and strategy integration rules

- XGBoost: remove synthetic/random predictors; fit transforms only on training folds; resolve forward-label tail rows; validate feature availability time.
- LSTM: require a genuine recurrent model, real optimizer/loss loop, validation/early stopping and serialized state_dict. A class named MLP is not an LSTM.
- Deep Learning / Vision: register as plugins with explicit input schemas, resource limits, model hashes and independent evaluation. No model receives order permissions.
- SMC: use the canonical causal implementation; confirmed pivots and higher-timeframe bars become available only after confirmation/close. Entry simulation must respect the next eligible event.
- NOVA Brain: evaluate immutable historical request/response replays. Do not regenerate old LLM outputs and pretend they are historical observations.
- Meta Decision: consume aligned OOF evidence only; abstain on missing, stale, uncalibrated or contradictory inputs. Correlated models do not count as independent votes.
- MTRADERS 30-module work: treat as candidate research baselines until original EA logic is available and parity is demonstrated. Do not label it as a verified port.

## 8. Zero-cost deployment and compute policy

- Reuse the current repository, existing frontend, existing Cloudflare/Supabase/Netlify footprint and local/Colab CPU research paths where available.
- Cloudflare Workers are for routing, authentication and bounded API operations, not large training jobs.
- Heavy backtests/training run locally or on an already-available free CPU notebook runtime. No paid GPU, paid queue, paid observability, hosted MLflow, Redis, Kubernetes or new storage bucket in this phase.
- Use GitHub for source and metadata contracts, not large market datasets, model weights, broker exports or secrets.
- Supabase stores bounded metadata and ownership records only; no migration or schema mutation in this architecture/audit phase.
- Do not create or activate any paid resource. If an existing free-tier quota is insufficient, mark the task BLOCKED rather than silently incurring cost.

## 9. Safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No order placement/modification/cancellation/close, withdrawals, transfers or account mutation tools.
- No broker credentials, bridge tokens or service-role secrets in model prompts, notebooks, browser code, logs or Git.
- No model, LLM, MCP tool or generated strategy can alter risk limits or authorize execution.
- Missing data, auth, tenant proof, quality receipt, cost assumption or evidence must fail closed.
- No merge, deployment, migration, secret change, production binding change or live trading is part of this work order.

## 10. Audit findings and gaps

### Confirmed from source

1. A suitable authenticated Command Center application exists, but the Trading page inspected is fixture-backed and explicitly read-only.
2. Quant Engine documentation already defines a research plane and data/experiment contracts; a new QuantLab must be a product/workstation layer over it, not another quant backend.
3. Training and model implementation have material fidelity gaps: mock checkpoint utility and MLP rather than LSTM.
4. A research-only Meta Decision contract exists, but its presence does not prove OOS calibration or positive trading edge.
5. System Integration Hub and broad architecture boundaries are documented; source docs do not establish deployed integration.
6. Multiple active PRs overlap with this target. Integrate only after exact-head review and compatibility tests.

### Not verified in this repository-only pass

- Current deployed Cloudflare Worker versions, bindings, routes and secret names.
- Live Supabase schema/RLS state and actual tenant-isolation behavior.
- Actual MT5 relay reachability, Exness Demo history retrieval or exported market data.
- Current Netlify deployment SHA and end-to-end API behavior.
- Whether all root-level legacy UI views are reachable from the authenticated Command Center.
- Full frontend build, backend tests, MQL5 compile or runtime integration tests.

These are explicit follow-up audit items, not assumed successes.

## 11. Delivery phases and exit criteria

### Phase 0 — Repository architecture audit (this branch)
- Record the Main SHA and source-level findings.
- Map current app, Hub, MCP, Quant Engine, model, data, approval and read-only broker boundaries.
- Identify duplicate PRs/contracts and mark integration dependencies.
- No application source changes, migrations, secrets or deployment.

### Phase 1 — Contract reconciliation
- Review PRs #403, #421, #422, #382, #386, #384, #383, #370, #319 and #302 at exact current heads.
- Select one canonical Hub, MCP gateway, dataset registry, experiment registry and candidate lifecycle.
- Produce a conflict matrix and ownership decision before implementation.

### Phase 2 — Workstation shell specification
- Confirm `apps/nova-command-center` as the only active UI shell after build/runtime validation.
- Define routes, shared navigation, API contracts, status taxonomy and feature flags.
- Ensure every module is read-only/research-only and uses the existing auth boundary.

### Phase 3 — Research integration
- Wire existing dataset, strategy, model and experiment registries only after contract and authorization tests pass.
- Add no duplicate broker gateway, model registry, MCP server or quant execution engine.
- Preserve immutable run provenance and evidence links.

### Phase 4 — Verification
- Run exact-head frontend typecheck/lint/tests/build and focused Python contract tests.
- Verify auth outage, tenant isolation, missing data, stale data, duplicate runs, malformed manifests and disabled execution.
- Validate UI labels against actual source evidence; fixture data must remain visibly DEMO.

### Phase 5 — Release readiness
- Draft PR only; independent review and exact-head CI evidence required.
- No merge/deploy or execution enablement without a separate explicit decision and production gate.

## 12. Acceptance checklist

- [x] Integrated Workstation A selected.
- [x] Current Main SHA verified before branch creation.
- [x] Dedicated Development Branch created from Main.
- [x] Repository-source audit started and existing overlap recorded.
- [x] Zero-cost-first and Live Trading OFF constraints recorded.
- [ ] Runtime/provider audit completed.
- [ ] PR overlap and canonical ownership matrix approved.
- [ ] Command Center build/test evidence captured at exact branch head.
- [ ] UI/API integration plan reviewed against existing contracts.
- [ ] Draft PR created after documentation review.

## 13. Source references

- `docs/INTERNAL-QUANT-ENGINE-ARCHITECTURE.md`
- `docs/SYSTEM-INTEGRATION-HUB-DESIGN.md`
- `apps/nova-command-center/README.md`
- `apps/nova-command-center/src/routes/_authenticated/trading.tsx`
- `workers/quant_engine/README.md`
- `workers/quant_engine/training.py`
- `workers/quant_engine/torch_models.py`
- `workers/quant_engine/meta_decision.py`
- PR #403 — architecture-documentation audit
- PR #421 — multimodel evaluation readiness
- PR #422 — Unified Intelligence & Validation Engine
- PR #302 — MTRADERS hybrid research engine


## 14. Audit refresh — exact-head PR and contract findings (2026-11-26)

The following status snapshot was fetched after the initial document commit. PRs remain independent branches; none was merged or cherry-picked by this audit.

### Exact-head review and CI

| PR | Current head | Current-main ancestry | Exact-head checks | Decision |
|---|---|---|---|---|
| #403 | 0d046b7e4cb8ace64ad657bd8679c18f4d7f5f58 | Base SHA 6968e5b... is stale vs current Main | Windows bootstrap/safety PASS; Supabase Preview SKIPPED | Documentation evidence only; rebase/port after wording reconciliation |
| #421 | 45c2446ea6d87a21424c7c20b42e21cb2e7d131e | Based on current Main SHA | Supabase Preview SKIPPED; no substantive test run surfaced | Keep as readiness audit; note its body contains a different stale head SHA |
| #422 | 9654dc79dab966a8472e95b58c1bd95df0cfd296 | 44 ahead / 0 behind current Main | contracts PASS; quant-foundation-tests PASS; Supabase Preview SKIPPED | Strongest reusable evaluation implementation; still no data/training/OOS evidence |
| #382 | 2a659894a05f6c7eb4d288996155d69e1ec2df0e | Diverged: 22 ahead / 184 behind current Main | system-hub-tests PASS (54/54 per PR evidence); broad build FAILURE; production smoke and Supabase Preview SKIPPED | Do not merge directly; port reviewed Hub contracts onto current Main and repair CI |
| #386 | 3724c9e327c60bf229711d61846b53a9045e0c2a | Diverged: 3 ahead / 184 behind current Main | build FAILURE; smc-tests FAILURE; Supabase Preview SKIPPED | Use inventory findings, but port changes and resolve failures |
| #384 | e80a06e80098a2c82bd9db880969fd13258ab251 | Diverged: 16 ahead / 184 behind current Main | build, Install/typecheck/lint/test/build, and smc-tests FAILURE; Supabase Preview SKIPPED | Do not merge directly; migration/UI/MCP are candidate assets only |
| #383 | 3e65f554e1a01524f12a04ab2bf87b473ef1becb | Diverged: 4 ahead / 50 behind current Main | contract-tests PASS (17/17 per PR evidence); Supabase Preview SKIPPED | Port intended XGBoost fixes only after current-Main compatibility review |
| #370 | 46abf02a72a155c7d6bbe722a1ededb784f8da3d | Diverged: 1 ahead / 184 behind current Main | No passing runtime evidence established in this audit | Reuse as architecture reference only |
| #319 | d3e0258bad084bc93407b0cddb270716301dd1fd | Diverged: 5 ahead / 268 behind current Main | 17 local tests reported in PR body; exact-current-main CI not established | Do not merge; reconcile with PR #370 and #422 before any port |
| #302 | d38368ef9b562fb7ed53592b6e4536c1b8e8e64e | Stacked on PR #297 / non-main base | Draft; parent dependency and exact-head CI still required | Research baselines only; no EA source-fidelity claim |

The ancestry figures above compare each fetched head against main@821db357d70d3613b0ca61520eaae5c5307e8fd4. A PR that is many commits behind must not be merged or rebased blindly. Port only reviewed files/contracts and rerun tests against current Main.

### Registry contract review

Source review of PR #384 migration and UI found:

1. The migration creates owner-scoped Dataset, Model and Learning Run tables with RLS and owner-consistent foreign keys. It is a candidate and has not been applied.
2. Authenticated users can insert only pending Dataset rows and candidate Model rows. There is no authenticated Learning Run insert policy and no authenticated update policy. This is fail-closed, but it means the current UI is a read-only registry, not an operational job queue.
3. nova_learning_runs.run_key is globally unique rather than owner-scoped. Prefer unique(owner_id, run_key) to avoid cross-tenant key collisions and keep identity tenant-local.
4. Model architecture enum is limited to xgboost, lstm, hybrid_xgboost_lstm, meta_ensemble and other. QuantLab needs a versioned plugin descriptor/architecture taxonomy for Vision, SMC, LLM replay and future models; do not overload other as the long-term integration contract.
5. The UI correctly says training is not triggered and the compute worker is not connected. Preserve that distinction until a real worker, durable job claim/lease, idempotency and artifact handoff exist.
6. Migration/tenant isolation has not been validated on Supabase Preview or staging. Do not apply it to the production project from this branch.

### Hub and MCP review

- PR #382 source defines a bounded Hub contract with authentication, schemas, response envelopes and downstream user-token forwarding. Its dedicated system-hub test suite reports 54/54 passing, but the PR's broader build check is failed and it explicitly says the MCP Worker migration to Hub routes is Phase 2 and not complete.
- PR #386 inventory distinguishes the actual Remote MCP Worker from a static metadata endpoint and a legacy Python FastAPI prototype with randomized mock metrics. Keep exactly one client-facing MCP endpoint. The prototype remains archive-only.
- Runtime health endpoint, authenticated MCP endpoint, deployed-code parity, RLS/tenant isolation and actual downstream Service Binding behavior remain unverified in this audit.

### Quant Evaluation review

- PR #422 unified_evaluation.py contains useful pure functions for dataset hash/manifest admission, chronological purged folds, final-OOS boundary purge, session segmentation, point-in-time validation, immutable LLM replay and abstaining signal fusion.
- Exact-head contract and quant foundation CI checks pass, but Supabase Preview is skipped. No approved dataset, real training run, immutable Brain replay, transaction-cost-complete backtest or final OOS profitability result is established.
- Keep RUN_TRAINING=False defaults and require an approved immutable dataset receipt. Do not treat a passing unit test as model validation.
- PR #383 orchestrator is a separate XGBoost-oriented implementation. Avoid a second run registry/orchestrator: extract compatible validators into the shared evaluation contract only after tests establish equivalent semantics.

### Updated ownership decision

| Capability | Canonical owner candidate | QuantLab integration rule |
|---|---|---|
| UI shell / navigation | apps/nova-command-center | Extend existing authenticated shell; no second frontend |
| Authenticated control plane | voom-system-hub | One Hub; port PR #382 contracts after CI repair |
| Client-facing MCP | voom-system-mcp Remote MCP Worker | One MCP endpoint; no per-service MCP listener |
| Dataset / Model / Run metadata | Existing NOVA Registry proposal (#384) | Reuse schema after migration redesign and staging RLS proof |
| Quant evaluation | workers/quant_engine/unified_evaluation.py (#422) | Preferred shared pure evaluation contract |
| XGBoost learning | PR #383 orchestrator code | Port fixes into shared Quant Engine; no parallel orchestrator |
| Strategy arbitration | Reconcile #370, #319 and #422 | One versioned candidate/evidence contract; deterministic risk remains separate |
| Broker data | Existing MT5 read-only Gateway/Relay/Proxy | Read-only only; no broker write methods |
| Compute | Local / already-available free CPU runtime | No paid queue/GPU/hosted worker; worker remains unconnected until verified |

## 15. Corrected acceptance status

- [x] Exact Main SHA rechecked: 821db357d70d3613b0ca61520eaae5c5307e8fd4.
- [x] QuantLab Development Branch head rechecked.
- [x] Exact PR heads and selected CI checks fetched.
- [x] PR ancestry drift and failed checks recorded.
- [x] Registry schema and permissions inspected.
- [x] MCP/Hub ownership and migration boundary inspected.
- [ ] Runtime/provider and tenant-isolation audit.
- [ ] Resolve current-Main port plan and canonical contract ownership.
- [ ] Build/test the integrated workstation at exact Development Branch head.
- [ ] Draft PR only after exact-head validation.


## 16. Live infrastructure read-only audit (2026-11-26)

This section records read-only control-plane/database inspection. No Cloudflare configuration, Worker code, Supabase schema, migration, secret, route, deployment or trading setting was changed.

### Cloudflare account and Worker inventory

The connected Cloudflare account exposes these relevant scripts:

- voom-system-mcp
- voom-system-hub
- voom-mt5-bridge-relay and voom-mt5-bridge-relay-staging
- voom-mt5-readonly-proxy and voom-mt5-readonly-proxy-staging
- nova-core-api-staging
- voom-system-nova-ai
- voom-system-nova-ui

Control-plane deployment snapshot:

| Worker | Latest listed deployment | Active version traffic | Observation |
|---|---|---:|---|
| voom-system-mcp | 2026-11-01 | 100% | Older than the latest Hub deployment; check protocol compatibility before cutover |
| voom-system-hub | 2026-11-23 | 100% | Hub exists and has a recent deployment; source-to-deployed parity not proven |
| voom-mt5-bridge-relay | 2026-11-23 | 100% | Bridge Relay deployment exists |
| voom-mt5-readonly-proxy | 2026-11-23 | 100% | Read-only Proxy deployment exists |
| nova-core-api-staging | 2026-11-24 | 100% | Staging API deployment exists |

The account-level Workers subdomain is enabled. Script settings expose Supabase URL/publishable-key bindings for MCP/Hub and secret bindings for MT5 routing/authorization on the broker adapters. Secret values were not read or recorded.

The MCP Worker's latest listed deployment is 2026-11-01, while the Hub's latest listed deployment is 2026-11-23. This does not prove they are incompatible, but it creates a version-skew risk. The Hub PR itself says MCP migration to Hub routes is Phase 2 and is not complete.

A public health URL attempt through the available web retrieval path was not accessible. This is not evidence that the Workers are down; authenticated HTTP health and MCP protocol smoke tests remain unverified. The control-plane API confirms deployment assignments, not successful end-user requests or repository SHA parity.

### Supabase live project snapshot

The inspected project was ACTIVE_HEALTHY, PostgreSQL 17, region ap-northeast-1. Read-only schema inventory across schemas found:

| Schema/table | RLS | Interpretation |
|---|---|---|
| nova.audit_events | enabled | Existing NOVA audit store |
| nova.approvals | enabled | Existing NOVA approval metadata |
| nova.emergency_stops | enabled | Existing emergency-stop metadata |
| nova.mt5_broker_connections | enabled | Existing NOVA MT5 Demo connection metadata |
| public.affiliate_state_snapshots | enabled | VOOM Studio Affiliate durable snapshot table |

No nova_dataset_registry, nova_model_registry or nova_learning_runs tables were present in the live schema inventory. The PR #384 migration 202611240001_nova_learning_registries is not present in the listed migration history. Therefore the PR #384 Learning Dashboard cannot be assumed to work against this database yet.

The same Supabase project contains both NOVA schema tables and an Affiliate-owned public table. This is logical schema separation, not separate Supabase project/database isolation. Before QuantLab adds more data, confirm whether project-level sharing is an accepted zero-cost compromise or whether NOVA and Affiliate require separate project boundaries. Do not move data or create another project as part of this audit.

### Live Supabase security observations

The project's Security Advisor returned:
- INFO: public.affiliate_state_snapshots has RLS enabled but no policies.
- WARN: leaked-password protection is disabled.

The RLS-without-policy finding may be an intentional deny-all posture for a private server-side snapshot table; it is not permission to add a broad policy. Verify its intended access path and server-side ownership before changing it. Leaked-password protection is an Auth hardening item, not a QuantLab migration dependency. Both findings are recorded for review; neither was modified.

### Revised runtime integration gate

Before the Integrated Workstation can be called operational, require:

1. Verify the deployed Worker code/version against the intended Git commit for MCP, Hub, Bridge Relay and Read-only Proxy.
2. Run public health and authenticated MCP/Hub contract smoke tests without exposing credentials.
3. Verify Hub-to-MCP/Proxy Service Binding behavior and downstream token validation.
4. Verify the NOVA Supabase schema and RLS with owner A / owner B test identities in an isolated staging environment.
5. Decide whether NOVA/Affiliate project-level database separation is required; preserve the current schema boundary until that decision.
6. Only then port the Registry migration design, repair its tenant-local run key and typed plugin model, and test the migration in staging. No production migration is authorized here.

## 17. Final audit status update

- [x] Cloudflare Worker inventory and latest deployment assignments inspected read-only.
- [x] Relevant Worker binding names/types inspected without reading secret values.
- [x] Supabase project health and schema inventory inspected read-only.
- [x] Confirmed NOVA Core tables exist in the nova schema.
- [x] Confirmed QuantLab Registry tables/migration are not present in the inspected project.
- [x] Identified shared Supabase project-level boundary between NOVA and Affiliate.
- [x] Recorded Supabase Security Advisor findings without modifying policies or Auth settings.
- [ ] Public/authenticated Worker smoke tests and deployed-source parity.
- [ ] Staging RLS tenant-isolation verification.
- [ ] Decide project-level NOVA/Affiliate Supabase isolation policy.
- [ ] Build and test the QuantLab workstation on this Development Branch.


## 18. Delivery update — Contract Reconciliation PR #427 (2026-11-26)

- [x] Contract reconciliation and implementation blueprint added at `docs/NOVA-QUANTLAB-CONTRACT-RECONCILIATION-2026-11-26.md`.
- [x] Draft PR #427 opened against Main; base SHA remains `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
- [x] Draft PR contains documentation only; no app code, migration, production configuration or deployment changed.
- [x] Rechecked Main SHA and Development Branch head after PR creation.
- [ ] CI/build validation: NOT PASSED. The commit status currently reports CircleCI Pipeline = `error`; failure details have not been retrieved, so root cause is UNKNOWN.
- [ ] Authenticated Hub/MCP/MT5 smoke tests, tenant isolation, real dataset admission and Quant Worker execution remain NOT VERIFIED.
- [ ] Do not merge PR #427 until the CircleCI error is understood and all required documentation/review gates pass.

PR: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/427
Development Branch: `dev/nova-quantlab-integrated-workstation-20261126`


## 19. Implementation update — first executable contract slice (2026-11-26)

The Development Branch now contains the first executable research-job domain primitive:

- `workers/quant_engine/job_lifecycle.py`: allowlisted research job types, immutable snapshots, explicit legal state transitions, expected-state conflict protection, terminal-state immutability, tenant-scoped event values and bounded free-CPU timeout.
- `tests/test_quant_engine.py`: added lifecycle contract tests.
- `.circleci/config.yml`: added the default CircleCI config after the exact status description identified the missing-configuration error.
- Quant Engine README and Contract Reconciliation document updated to describe scope and limitations.

This is not yet a durable job service. Persistence, transactionally appended events, distributed idempotency, worker leases, queue delivery, Hub API, authenticated worker dispatch and cross-tenant authorization remain unimplemented.

### CI and local validation

- CircleCI's prior error was explicitly `No configuration was found in your project`; the default config is now present on this branch. Latest `quant-foundation` check must complete successfully before merge.
- GitHub Actions exact-head Quant Engine check must also be inspected independently.
- Connected Windows workstation is on the correct development branch, but C: has 0 bytes free; Bun is unavailable. Frontend install/build was not run. No cleanup or deletion was attempted.
- No production configuration, Cloudflare/Netlify deployment, Supabase migration, secrets, or broker state was changed.

### Updated status

- Architecture and source audit: DONE.
- Contract reconciliation: DONE.
- Pure research job lifecycle primitive: IMPLEMENTED; CI pending.
- Durable job service and Hub integration: NOT STARTED.
- Registry persistence and RLS verification: BLOCKED.
- Frontend QuantLab routes/API wiring: NOT STARTED.
- Real dataset/worker/model/OOS evidence: NOT VERIFIED.
- Main remains unchanged at `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
