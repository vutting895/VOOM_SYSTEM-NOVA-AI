# NOVA Autonomous Trading — Architecture and Delivery Gates

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Baseline inspected:** `aad16f6c62ace703624845780e46110ca9a4beda`  
**Tracking:** Issue #163; master delivery gate Issue #36  
**Operating mode:** Read-only + AI Analysis; paper simulation is local/research-only  
**Execution safety:** `ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, `liveTradingEnabled=false`

## 1. Product objective

Build one governed NOVA Trading platform that can ingest authorized market data, evaluate versioned strategies, calculate risk, simulate paper trades, explain decisions, and monitor performance. The AI may propose and explain actions; deterministic server-side policy owns authorization, tenant identity, risk limits, and every side effect.

“Autonomous” in this plan means autonomous analysis, research, simulation, monitoring, and draft preparation. It does not mean unrestricted model tool access or permission to place broker orders.

## 2. Current repository baseline

The inspected `main` contains:
- A deterministic OHLCV EMA backtest prototype (`workers/backtest/engine_prototype.py`), with historical simulation only.
- A fail-closed risk prototype (`workers/risk/manager_prototype.py`), not connected to a broker or EA.
- A disabled live execution boundary (`workers/execution/ccxt_exec.py`); it must remain disabled.
- A deterministic SMC research engine (`workers/feature/smc_wave/smc_strategy.py`).
- Existing NOVA System Hub, owner-scoped broker APIs, AI orchestration contracts, durable approval APIs, and an OpenBao Transit client scaffold.

Known work to reuse rather than duplicate:
- PR #66: frozen Wave3 v6.2.6.3 benchmark. Its recorded Final OOS result is 0 closed trades and predictive metrics below the majority baseline; it has not demonstrated a tradable edge.
- PR #147: separate positive-edge research redesign. Keep it separate from the frozen benchmark; do not relax the frozen gates or tune on Final OOS.
- PR #103, #152, #161, #87: read-only adapter, Exness API client, multi-broker plan, and provider registry work. Their staging/credential-custody gates remain distinct.
- PR #67/#77: durable owner-scoped review lifecycle and expiry/request-limit fixes. A complete graph checkpoint/resume integration remains separate.
- Issues #36, #78, #82: delivery gates, secure provider onboarding, and customer-owned workspaces.

## 3. Target architecture

```text
Customer NOVA UI / Personal AI
        |
        | authenticated request; bounded intent only
        v
NOVA API + System Integration Hub
        |
        +--> Auth / owner / tenant / entitlement policy
        |
        +--> Read-only Provider Adapters
        |       Exness Demo MT5 / approved future providers
        |
        +--> Market Data Normalizer + Provenance
        |
        +--> Strategy Registry + Research Engine
        |       SMC / Wave3 / XGBoost / LSTM / baselines
        |
        +--> Deterministic Risk Engine
        |
        +--> Proposal API + Durable Human Review
        |
        +--> Isolated Paper Ledger / Simulator
        |
        +--> Audit / Metrics / Monitoring / Kill Switch
        |
        +--> Credential Provider (server-only; OpenBao gate)
```

Control-plane rules:
1. The Hub derives the user from the verified session. Client/model-supplied owner, tenant, connection, route, host, credential, risk limit, or capability values are never authorization.
2. Provider adapters expose only allowlisted read operations in the initial release. No generic URL proxy, chat credential collection, or arbitrary provider tool.
3. Market data must carry source, symbol, timeframe, timezone, retrieval timestamp, sequence/coverage and quality metadata. Stale, malformed, gapped or unverified data fails closed.
4. Strategy code is versioned and deterministic where possible. Every run records strategy/config/data/code versions and hashes.
5. Model output is an untrusted proposal. Server-owned schemas, strategy registry, risk policy and approval state validate it before simulation.
6. Paper simulation is a separate ledger. It never calls the live execution worker or any broker endpoint.
7. The live execution worker stays disabled. No paper or research milestone authorizes broker writes.

## 4. Delivery sequence

### M0 — Repository baseline and contract reconciliation
- Recheck `main`, active PR heads, issue dependencies, CI and host targets before each implementation slice.
- Reconcile adapter, strategy, approval, OpenBao and workspace work; do not create competing gateways or schemas.
- Preserve all existing source; use focused branches and PRs.

**Exit:** reviewed dependency map, exact base SHA, no unexplained overlap/deletion, tests selected for the changed components.

### M1 — Read-only market-data foundation
- Finish the existing provider registry and adapter contract.
- Normalize quotes/candles and validate source, timestamps, symbol mapping, OHLC bounds, monotonicity, gaps, freshness and price basis.
- Verify signed-in owner → Hub → provider route, tenant isolation, and sanitized account/market reads.
- Keep broker credentials outside browser, model, Postgres plaintext, logs and artifacts. OpenBao Transit client scaffold is not production credential custody; private transport, narrow machine identity, policies, deployment, backup/restore and two-owner tests are separate gates.

**Exit:** authenticated owner reads succeed; unauthenticated, expired, mismatched-owner and foreign-connection requests fail closed; no broker write capability is present.

### M2 — Research-grade strategy engine
- Keep PR #66 benchmark frozen and inspect its exact-head artifacts; no threshold/weight/lookback/news/risk relaxation.
- Implement PR #147's causal SMC traces and no-lookahead tests, first-hit/triple-barrier labels, baselines, ablations, calibration and regime analysis.
- Use chronological nested walk-forward with purge/embargo; tune only in training/inner-validation folds.
- Preserve a single untouched Final OOS. Account for spread, commission, slippage, swap/funding, latency and instrument-specific contract sizing.
- Record reproducible data/code/config hashes and Deflated Sharpe / Probability of Backtest Overfitting limitations.

**Exit:** sufficient closed OOS trades, positive net expectancy after realistic costs, PF > 1 (development target >=1.2), relevant predictive metrics above baseline, and stable fold/regime results. If not, mark research blocked; never force signals by weakening gates.

### M3 — Deterministic paper-trading ledger
- Create an isolated paper-only simulator that consumes validated proposals and independent risk decisions.
- Enforce idempotency, cash/position accounting, no leverage/shorting by default, fee/slippage assumptions, quote freshness, market status, audit events and replay safety.
- Use adverse simulated fills and explicit simulation assumptions; never call a broker.
- Keep simulated fills distinct from broker orders and provider connection status.

**Exit:** deterministic unit/integration tests, accounting invariants, replay/idempotency tests, stale-data and risk-denial tests, and explicit assertions that no broker request can occur.

### M4 — Governed AI orchestration
- Reuse bounded agent tool contracts and durable approval lifecycle.
- Add only read-only analysis, backtest, risk evaluation and paper-proposal tools to the initial allowlist.
- Integrate durable graph pause/resume only after server-fetched owner-bound approval, immutable proposal hash, policy version, expiry, atomic one-time decision and checkpoint isolation are verified.
- AI cannot edit policy, tenant identity, provider secrets, risk limits, execution flags, or tool allowlists.

**Exit:** adversarial tool-contract tests, two-owner approval isolation, replay/expiry tests, prompt injection boundary tests, and audit evidence.

### M5 — Customer Trading workspace
- Extend the canonical NOVA frontend; no parallel app.
- Provide market watch, chart, strategy state, risk summary, paper positions, trade journal, backtest evidence, AI explanation and connection readiness.
- Personal AI threads/checkpoints are scoped by authenticated owner + tenant + workspace.
- Use fixed, schema-validated UI components; no model-generated executable HTML/JS.
- Version consent, risk disclosure, provider disclosure and policy acceptance; obtain qualified legal review before commercial activation.

**Exit:** two-user/two-tenant data isolation, route authorization, accessibility/UX checks, and exact Preview evidence.

### M6 — Staging verification
- Use isolated staging/test users only; never production customer accounts for tests.
- Verify secret custody/rotation/revocation, provider identity, owner/foreign-connection reads, RLS, audit redaction, request limits, rate limits, kill switch, no-order assertions and backup/restore.
- Capture exact commit SHA, workflow run IDs, Preview deployment IDs, sanitized runtime evidence and rollback reference.
- Production cutover requires separate explicit approval.

**Exit:** every applicable delivery-plan gate is passed with evidence; skipped/unavailable checks remain blockers.

### M7 — Future execution authorization (not part of this activation)
This phase is disabled and requires a new explicit approval. Before any broker write capability is considered, require:
- independently reviewed execution adapter and threat model;
- proven positive out-of-sample strategy edge and operational stress testing;
- demo-only end-to-end acceptance with idempotent order lifecycle, reconciliation, rate limits, kill switch and human override;
- least-privilege broker scopes, tenant isolation, monitoring, incident/rollback procedures and legal review;
- explicit user approval for the exact provider, account environment, risk envelope and release.

No approval is implied by this roadmap, paper-trading tests, a green UI, or a passing CI workflow.

## 5. Global invariants

- Read-only + AI Analysis remains the only active broker mode.
- `ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, `liveTradingEnabled=false` remain server-enforced.
- No secret, token, account login ID, private route map or raw provider payload in Git/chat/prompts/logs/artifacts.
- No production database migration, secret, route, DNS, hosting setting or deployment is changed without a separate explicit approval.
- No claim of profitable trading without inspectable net-of-cost OOS evidence.
- A process running, a health check passing, a configured secret, a Preview ready, or an approval UI state is not proof of end-to-end broker or trading readiness.

## 6. Immediate implementation order

1. Review PR #147 diagnostics and preserve PR #66 as the frozen benchmark.
2. Reconcile #103/#152/#161/#87 and OpenBao staging design before any credential lifecycle implementation.
3. Add an isolated paper ledger and tests that cannot call broker execution.
4. Connect proposal generation only after risk/data contracts are validated.
5. Deliver dashboard and monitoring after the APIs and tenant security contracts are stable.
