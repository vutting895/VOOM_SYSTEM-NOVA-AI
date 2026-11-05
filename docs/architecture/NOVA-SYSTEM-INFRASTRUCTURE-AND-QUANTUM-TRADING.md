# NOVA System Infrastructure & Quantum Trading Architecture

- Date: 2026-11-05
- Status: Architecture baseline / implementation plan; this document is not a deployment or performance claim.
- Source of truth: \`vutting895/VOOM_SYSTEM-NOVA-AI\`
- Main baseline reviewed: \`6e8d390ac45187fb70b6acb23f1e428a20ca7006\`
- Change policy: GitHub PR only; no direct main edits, hosted migrations, production deployments, secrets, paid compute, broker writes, or live trading.

## 1. Executive decision

NOVA becomes the shared AI infrastructure and control plane for independently deployable products. Trading is a separate product/repository that consumes NOVA capabilities through versioned, authenticated contracts. NOVA must not become a monolith that embeds every product's business logic.

**NOVA owns:** identity-aware AI orchestration, typed intent and capability policy, model/provider registry, agent and tool catalog, shared data contracts, event/audit conventions, observability, tenant-aware integration routing, and reusable workflow services.

**Trading owns:** market-data domain logic, strategy research, feature engineering, classical ML, quantum/hybrid research, backtesting, paper simulation, portfolio/risk research, and its own UI/API/runtime. The Trading project must never receive authority to redefine NOVA identity, tenant ownership, capability policy, or hard risk limits.

## 2. Target system map

~~~text
                         USERS / CLIENT APPS
             NOVA Workspace | Trading App | Video Studio | Future Apps
                                  |
                         Authenticated API edge
                                  |
                     +------------v-------------+
                     |       NOVA CORE          |
                     | Identity context adapter |
                     | Intent & schema registry |
                     | Capability policy        |
                     | Agent / tool registry    |
                     | Model & provider registry|
                     | Workflow orchestration   |
                     | Audit / trace / telemetry|
                     +------------+-------------+
                                  |
                  Versioned NOVA Project SDK / API
                                  |
             +--------------------+--------------------+
             |                    |                    |
       NOVA VIDEO            TRADING PROJECT       FUTURE PROJECTS
       own runtime           separate repo         independent repos
       own jobs              own jobs              own jobs
       own storage           own storage           own storage
             |                    |
             +--------------------+
                                  |
                  NOVA SHARED PLATFORM SERVICES
            Cloudflare edge / Workers / System Hub
            Supabase Auth + tenant-scoped Postgres/RLS
            object storage / event contracts / audit
            GitHub CI / release evidence / observability
~~~

### 2.1 Planes and ownership

| Plane | Responsibility | Authority |
|---|---|---|
| Experience | NOVA UI and independent project UIs | Presentation only |
| Identity | Supabase Auth session validation | Authenticated identity |
| Control | NOVA Core, System Hub, capability policy | Authoritative routing and permissions |
| Intelligence | Model registry, agents, prompts, tool schemas | Recommendations and bounded inference |
| Domain | Video, Trading, future products | Product-specific computation |
| Data | Shared canonical IDs and tenant-scoped records | Data ownership and lineage |
| Runtime | Cloudflare Workers and isolated project workers | Bounded execution only |
| Governance | CI, reviews, audit, release gates | Evidence-based release approval |

NOVA Core is a control plane, not a universal proxy, unrestricted agent, shared secret vault, or broker execution service.

## 3. NOVA Core infrastructure modules

The following are logical module boundaries. Reuse existing implementations where they already exist; do not create duplicate hubs, auth systems, MCP servers, or data planes.

| Module | Contract / responsibility | First implementation target |
|---|---|---|
| Identity Context | Verify Supabase token server-side; derive user and tenant context | Existing authenticated Workers / System Hub |
| Project Registry | Register project ID, owner, API version, capabilities, health and release metadata | Typed registry; no client-controlled tenant routing |
| Intent Registry | Versioned discriminated intent schemas; reject unknown fields | Shared JSON Schema + TS validation |
| Capability Policy | Allow/deny capabilities using server-derived identity and project policy | Existing NOVA System Core policy chain (#205/#217/#218) |
| Agent & Tool Registry | Allowlisted tool IDs, schemas, timeouts, rate limits and data classifications | Existing Remote MCP Worker and AI Worker |
| Model Registry | Model ID, provider, version/hash, license, data class, inference mode and status | Metadata first; no model auto-download |
| Workflow Service | Idempotency, bounded retries, durable job state and human review | Reuse project job systems; shared envelope |
| Data Contract Registry | Canonical timestamps, decimal/price precision, provenance and schema versions | Versioned contracts; do not force a shared business schema |
| Audit & Observability | Correlation ID, actor, project, capability, model, decision and outcome | Sanitized events; no secrets or raw tokens |
| Integration Gateway | Fixed server-owned routes and tenant-scoped provider adapters | Existing System Hub; no arbitrary URL proxy |

### 3.1 Project registration contract

Each independent product registers a server-controlled record containing:

- \`project_id\`: stable slug, e.g. \`trading\`, \`video\`.
- \`api_version\`: explicit major/minor contract version.
- \`owner_scope\`: resolved from authenticated server context, never trusted from request JSON.
- \`capabilities\`: only exact capability IDs in the active NOVA System Core allowlist. Product-local operation names and proposed extensions are not NOVA permissions; they require a separately reviewed Core policy change before registration.
- \`data_classification\`: public, internal, tenant, confidential.
- \`health_state\`: not_configured, configured, reachable, authenticated, data_verified, degraded, unavailable.
- \`release_ref\`: repository, commit SHA and deployment evidence.
- \`limits\`: request size, concurrency, timeout, quota and allowed data ranges.

A project registration does not grant a capability. The policy engine evaluates each call against authenticated user, tenant, project, capability, resource ownership, environment and current policy version.

### 3.2 Shared request envelope

Illustrative contract (all fields are validated server-side):

~~~json
{
  "schema": "nova.project.request.v1",
  "request_id": "uuid",
  "project_id": "trading",
  "api_version": "1",
  "intent": "research.market_regime",
  "capability": "market.quote.read",
  "resource": {
    "kind": "instrument",
    "id": "XAUUSD"
  },
  "input": {},
  "idempotency_key": "opaque-unique-key",
  "requested_at": "RFC3339 timestamp"
}
~~~

The authenticated identity and tenant are injected by the server after token verification. They must not be accepted as authoritative fields from this envelope. Responses include schema version, request/correlation ID, status, provenance, data timestamp, and a typed result/error. Never return tokens, secrets, internal route maps or another tenant's identifiers.

## 4. Independent Trading project

### 4.1 Repository and deployment boundary

Create a separate repository for the trading product (working name: \`NOVA-QUANTUM-TRADING\`). It has its own:

- frontend and research workbench;
- API and compute workers;
- market-data adapters and normalized data store;
- strategy/model code and experiment tracking;
- backtest and paper-simulation engine;
- quantum/hybrid research modules;
- CI, versioned releases and rollback plan.

It integrates with NOVA through the Project SDK / API contract. Do not move broker secrets, trading tables, model checkpoints, or trading business logic into NOVA Core. Do not create the separate repository until its owner/name and initial access model are confirmed; this PR establishes the contract in the NOVA source repository.

### 4.2 Trading internal architecture

~~~text
TRADING UI / RESEARCH WORKBENCH
             |
      Trading API (auth via NOVA)
             |
      Trading Application Layer
       |          |            |
   Market Data  Strategy     Experiment /
   & Quality    Registry     Model Registry
       |          |            |
       +----------+------------+
                  |
        Feature / Label Pipeline
                  |
       +----------+---------------------+
       |                                |
 CLASSICAL BASELINES              HYBRID QUANTUM LAB
 XGBoost / LightGBM               VQC / QNN / QLSTM
 LSTM / temporal models           QAOA / QUBO research
 Wave3 / SMC / regime             QRL policy research
       |                                |
       +---------------+----------------+
                       |
             Ensemble / Meta-labeler
                       |
           Deterministic Risk Research
                       |
            Backtest / Walk-forward
                       |
              Paper / Shadow Mode
                       |
        Read-only broker data adapter
          Exness Demo via current Hub
~~~

### 4.3 Trading domain operations and NOVA capability mapping

The following are proposed Trading-internal operation IDs, **not NOVA System Core capability IDs**. They do not become callable through NOVA merely by appearing in this design. The project may expose internal endpoints to its own isolated runtime, but every NOVA-to-Trading request must use an exact capability already approved by the active Core policy.

| Trading domain operation | Existing NOVA Core v1 capability | Availability through NOVA |
|---|---|---|
| \`trading.project.status.read\` | \`system.health.read\` | Allowed only for bounded project health metadata |
| \`trading.market.snapshot.read\` | \`market.quote.read\` | Allowed for tenant-authorized read-only quotes |
| \`trading.market.history.read\` | \`market.candles.read\` | Allowed for tenant-authorized historical candles |
| \`trading.strategy.draft.create\` | \`strategy.draft.create\` | Allowed as a non-executable draft |
| \`trading.model.inference.run\` | \`research.analysis.run\` | Allowed for bounded shadow/research inference only |
| \`trading.broker.demo.status.read\` | \`connection.own.read\` | Allowed for the authenticated owner's Demo connection metadata only |
| \`trading.strategy.catalog.read\` | None | Not exposed through NOVA v1; requires policy review |
| \`trading.backtest.run\` | None | Not exposed through NOVA v1; requires policy review |
| \`trading.experiment.read\` | \`learning.evaluation.read\` | Metadata/evaluation reads only; no model artifact or tenant bypass |
| \`trading.paper.portfolio.read\` | None | Not exposed through NOVA v1; requires policy review |

Any additional capability (including a new \`trading.*\` identifier) requires a separate change to System Core's allowlist, Hub enforcement, negative tests and independent security review. A project registration may narrow permissions but never expand the Core allowlist. No capability is implicitly granted by this document.

Explicitly absent from NOVA Core v1 and therefore not available as NOVA-authorized operations:

- broker order submit/modify/cancel;
- withdrawals, transfers, leverage changes;
- live mode activation;
- model-controlled risk-limit changes;
- arbitrary broker URL or credential submission.

Exness remains Demo / read-only through the existing tenant-scoped Windows MT5 Bridge → Relay/Proxy → System Hub path. A pending connection or health endpoint is not proof of authenticated account/quote access. Acceptance requires owner-authenticated account and quote reads plus foreign-tenant denial.

## 5. Quantum and hybrid quantitative research

### 5.1 Design principle

Use quantum computing as an experimental research accelerator, not a marketing label or assumed source of alpha. Every quantum/hybrid experiment must be compared with a strong classical baseline on identical chronological splits, costs, features and compute budgets. No quantum advantage is claimed without reproducible evidence.

The system supports three execution classes:

1. **Classical baseline:** CPU-first, deterministic, production-friendly research.
2. **Quantum simulation:** PennyLane/Qiskit simulators on local CPU; useful for circuit correctness and research, not proof of QPU advantage.
3. **Quantum hardware:** optional future QPU backend only after account, cost, queue, privacy, provider, licensing and reproducibility approvals. It is not part of the zero-cost baseline.

### 5.2 Research modules

| Module | Candidate methods | Required baseline / acceptance |
|---|---|---|
| Quantum feature map | Angle encoding, ZZ feature maps, data re-uploading | Logistic regression / XGBoost on same features |
| VQC regime classifier | Parameterized circuits, Pauli-Z measurements | Classical MLP / XGBoost; calibration and walk-forward |
| QLSTM / quantum recurrent | Hybrid recurrent layers with quantum feature blocks | LSTM / GRU / temporal CNN |
| QAOA portfolio research | Explicit QUBO/Ising Hamiltonian and QAOA circuit | Exact solver for small n; classical heuristic for larger n |
| Quantum-inspired optimization | Simulated annealing, tensor/network heuristics | Same objective, constraints and runtime budget |
| QRL policy research | Offline RL / contextual bandit with quantum policy head | Classical PPO / SAC / bandit baseline; strict offline evaluation |
| Meta-labeling | Triple barrier, calibrated secondary model | No-lookahead labels and purged/embargoed CV |
| Hybrid ensemble | Wave3 + SMC + XGBoost + LSTM + VQC | Majority, simple linear and strongest single-model baseline |

### 5.3 Current quantum code: honest capability assessment

The inspected \`backend/quant_engine.py\` is a research prototype, not a validated quantum trading system:

- PennyLane VQC circuit code exists, but its use depends on the optional PennyLane package and selected simulator/backend.
- \`_analytical_vqc_simulation\` is a hand-written trigonometric approximation; it is not a statevector simulation and must not be reported as a quantum circuit execution.
- \`optimize_portfolio_qaoa_qubo\` enumerates bitstrings classically and applies a Boltzmann-style weighting; it does not execute a QAOA circuit or VQE solver.
- \`evaluate_qrl_policy\` uses fixed initialized weights and hand-coded thresholds; it is not a trained reinforcement-learning policy.
- The current output names and comments overstate some capabilities (e.g. QAOA/VQE, QRL, entropy). They must be corrected or explicitly labelled \`research_proxy\` until real algorithms and tests are implemented.
- No measured predictive edge, quantum advantage, profitability, or hardware execution is established by this code.

Required remediation: split interfaces from implementations; label each backend (\`classical_baseline\`, \`analytic_proxy\`, \`pennylane_simulator\`, \`qpu_provider\`); reject unsupported backend names; record package/provider versions and seeds; test circuit outputs against known small circuits; implement genuine QAOA only behind a separately tested solver adapter; and keep any heuristic/analytic approximation clearly named.

### 5.4 Experiment record

Every experiment stores:

- immutable dataset snapshot ID, source, checksum and data window;
- symbol, venue, timezone, timeframe and corporate-action/session rules where applicable;
- feature schema/version, label method and lookahead audit;
- train/validation/final-OOS time ranges;
- model/circuit architecture, code commit, dependency lock and seed;
- simulator/QPU provider, device, shots, noise model and execution metadata;
- classical baseline and matched compute budget;
- fees, spread, slippage, latency and financing assumptions;
- metrics with uncertainty and trade count;
- reviewer, approval state and reproducible artifact references.

Final OOS data must remain untouched by feature selection, hyperparameter tuning, threshold tuning and model selection. Use walk-forward evaluation, purging/embargo where labels overlap, and a complete experiment ledger.

### 5.5 Evaluation gates

A candidate cannot be promoted because of accuracy alone. Minimum evidence:

- correct chronological split and no leakage;
- baseline comparison on identical data and cost assumptions;
- net performance after fees, spread, slippage and financing;
- profit factor, drawdown, exposure, turnover, trade count and calibration;
- confidence intervals / robustness across walk-forward folds;
- stability across regimes and symbols;
- reproducibility from immutable data and pinned code;
- independent review of data, labels and execution assumptions.

The previously defined Wave3 / XGBoost / LSTM / SMC gates remain the trading project's strategy-specific acceptance criteria. Quantum models do not bypass them or relax final-OOS requirements.

## 6. Market data and numerical integrity

- Use integer ticks or decimal arithmetic for prices, quantities, fees and P&L; never use binary floating-point as the authoritative ledger representation.
- Store source timestamp, ingestion timestamp, venue, symbol mapping, timeframe, sequence/offset, quality flags and provenance.
- Preserve original provider payloads only where lawful and useful; normalized records must be versioned and reproducible.
- Detect gaps, duplicates, out-of-order ticks, timezone errors, stale quotes, impossible OHLC bars and spread anomalies.
- Backtests must not silently forward-fill missing tradable prices or use future information.
- Store compressed immutable raw partitions plus derived features; compression must be lossless for price/quantity precision.
- Keep market-data access separate from broker-account access and from order execution.

## 7. Security and governance

1. Supabase Auth verifies sessions; NOVA derives tenant ownership server-side.
2. RLS is enabled on exposed tenant data; policies include ownership predicates and correct UPDATE checks.
3. Never expose service-role/secret keys to browser code.
4. No secrets in Git, prompts, logs, model inputs, training data, checkpoints or audit payloads.
5. Project-to-project calls use short-lived authenticated context or server-side service identity with explicit audience and capability; never forward arbitrary browser tokens to arbitrary services.
6. Enforce exact-origin CORS, request-size limits, rate limits, timeouts, idempotency and replay protection.
7. Every model result is advisory. A deterministic policy layer controls capabilities; models cannot grant themselves access.
8. Keep broker write endpoints absent or hard-denied in the current release.
9. Require independent security review and two-user tenant-isolation acceptance before customer data or media workflows are enabled.
10. No production migration, Worker publication, model download, QPU call, billing change or paid compute without a separate explicit approval and evidence.

## 8. Release and rollback model

### Phase 0 — Architecture baseline
- Adopt this document as the target design after review.
- Reconcile existing Core (#205/#217/#218), data plane (#195), auth (#219), video (#221/#222), training guard (#216) and trading research (#66/#147) work.
- Do not merge stale or stacked PRs out of order.

### Phase 1 — NOVA infrastructure contracts
- Publish versioned Project SDK / API schemas.
- Add project registry and capability contract tests.
- Add model registry metadata and provenance.
- Add correlation IDs, audit event schema and status vocabulary.
- No new hosted database schema until migration history is reconciled and backup/restore evidence exists.

### Phase 2 — Independent Trading project foundation
- Create the separate repository after confirming its name and ownership.
- Port no code blindly; select audited modules from existing research prototypes.
- Implement data ingestion, quality checks, immutable experiment metadata and classical baseline.
- Integrate with NOVA in read-only mode.

### Phase 3 — Hybrid quantum research
- Correct labels and replace proxy implementations with explicit adapters.
- Validate circuit primitives on small known cases.
- Implement true QAOA/VQC experiments and compare to classical solvers.
- Add offline QRL only after reward design, data leakage controls and baselines are accepted.
- No hardware QPU or paid compute in the zero-cost phase.

### Phase 4 — Backtest and paper acceptance
- Run deterministic backtests and walk-forward.
- Verify OOS requirements and data provenance.
- Run shadow inference and paper simulation with no broker writes.
- Reconcile broker account/quotes through the authenticated Exness Demo path.

### Phase 5 — Production readiness
- Security review, two-user isolation, load and failure tests.
- Encrypted backup and isolated restore rehearsal.
- Migration drift resolved with exact applied SQL history.
- Canary deployment, health/data verification and tested rollback.
- Production activation is a separate approval, not implied by this architecture.

Rollback: disable project registration/capability at NOVA Core, stop project workers, preserve audit and immutable experiment artifacts, restore the last known-good project release, and leave broker access read-only. Do not roll back by deleting data or rewriting migration history.

## 9. Current known blockers / dependencies

- Main baseline for this document is \`6e8d390ac45187fb70b6acb23f1e428a20ca7006\`.
- NOVA System Core policy work is still represented by open stacked PRs #205, #217 and #218; the stack must be reconciled before claiming the central capability policy is live.
- Central data plane work is open as PR #195 and is based on an older main SHA; do not merge or rebase blindly.
- Frontend Auth work is open as PR #219; production auth acceptance is not implied.
- Video Engine Core PR #221 and CPU-first PR #222 are open drafts; neither establishes deployed generation.
- Training claims are explicitly guarded by PR #216; no daily auto-training should be claimed without real data, scheduled execution, artifacts and evaluation evidence.
- Quantum code is a prototype with analytic/classical substitutes as described above.
- Trading PRs #66 and #147 are research drafts; final-OOS edge is not established.
- Supabase migration history reconciliation, encrypted backup/restore and tenant isolation remain release blockers.

## 10. Definition of done

NOVA infrastructure is ready only when:
- a second independent project can authenticate and register without sharing business code or secrets;
- NOVA enforces project and capability permissions from verified identity and tenant context;
- all contracts are versioned, validated and covered by compatibility tests;
- audit events identify project, capability, model version, data provenance and outcome without exposing secrets;
- one project's outage or release does not break another project;
- project disablement and rollback are tested;
- no customer or production data is accessible cross-tenant.

Quantum Trading is ready for research acceptance only when:
- quantum and classical implementations are correctly labelled;
- circuit and optimizer implementations have mathematical/unit tests;
- classical baselines and matched compute budgets are reported;
- leakage-free walk-forward and final-OOS gates pass;
- results reproduce from pinned data/code/model artifacts;
- no model can invoke broker writes or change risk policy.

**This document defines the target architecture and work sequence. It does not certify that the listed modules are implemented, deployed, profitable, quantum-advantaged, or production-ready.**
