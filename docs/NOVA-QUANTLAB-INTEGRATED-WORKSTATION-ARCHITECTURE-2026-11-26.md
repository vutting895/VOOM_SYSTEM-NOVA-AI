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
