# NOVA Research Record: Zero-Menu, RL, and Multi-Broker Architecture

- Research date: 2026-10-29
- Repository baseline inspected: vutting895/VOOM_SYSTEM-NOVA-AI
- Baseline branch: main
- Type: architecture research and implementation checklist; not an implementation or deployment report
- Safety posture: Read-only + AI Analysis; Live Trading OFF; order submission disabled

## 1. Executive decisions

1. Keep the current NOVA System Integration Hub as a deterministic control plane. The LLM interprets user intent and proposes typed parameters; it does not decide identity, tenant ownership, risk authorization, or broker routing.
2. Keep Exness Demo through the existing MT5 read-only proxy/relay as the only broker path in the first release. Define a provider-neutral adapter contract, but defer IBKR and crypto-exchange connectors until the Exness authenticated path and cross-tenant tests have evidence.
3. Start RL as offline research and shadow-mode strategy selection. Do not let an RL policy place orders or raise risk caps. The existing deterministic risk layer remains authoritative and fails closed.
4. Treat Zero-Menu as an interaction model, not an absence of controls. Generate a constrained set of typed UI components from validated JSON. Use pause/resume only for state-changing or consequential workflows; keep read-only analysis free of needless approval interrupts.
5. Use LangGraph persistence/checkpointing only if a durable stateful graph is introduced. The application must authenticate and authorize the user before loading or resuming a thread. Checkpoints must not contain broker passwords, bearer tokens, bridge secrets, or other credentials.
6. Use FastMCP Streamable HTTP for a remote Python MCP server if/when a Python MCP service is needed. The current repository already has a separate Cloudflare Remote MCP Worker; do not replace it merely to align with a proposed stack.
7. Do not create a plaintext broker_credentials table. Store broker connection metadata and a secret reference in Postgres; store credentials only in an approved server-side secret store, encrypted vault, or isolated runtime secret file according to the provider.
8. Do not add Redis, Kubernetes, or a new orchestration framework by default. Start with the components already in the repository, and add a queue or deployment platform only when measured requirements justify the extra operational burden.

## 2. Evidence inspected in the repository

The following are observations from checked-in main-branch files, not claims that production services are currently connected or that tests have passed.

### 2.1 Existing foundation

- The root README describes a modular market-research and paper-trading platform with market data, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, and broker integration.
- The README states that live order execution remains disabled; the active broker target is Exness Demo through an MT5 read-only bridge; Alpaca is not in the active broker workflow.
- integrations/remote-mcp-worker/README.md documents authenticated, research/read-only tools, including market candles, EMA backtest, SMC analysis/backtest, paper-risk validation, pending Demo connection requests, and read-only MT5 account/symbol/quote tools.
- The Remote MCP README says an MT5 account read remains unavailable until an administrator provisions the dedicated Bridge route and the Cloudflare secret MT5_TENANT_ROUTES. A pending connection request does not provision a Bridge.
- integrations/mt5-readonly-bridge/README.md documents a Windows MT5 terminal bridge with GET-only endpoints, a tenant-specific ID and token, and fail-closed behavior for missing tenant configuration, tenant mismatch, and invalid authentication. It explicitly excludes order/trade/position-modification/transfer/withdrawal implementation.
- docs/SYSTEM-INTEGRATION-HUB-DESIGN.md says the Hub is a deterministic control plane, not an autonomous agent or universal URL proxy. Order placement, modification, and cancellation are out of scope for v1.
- .github/workflows/frontend-ci.yml lists tests for Supabase security migrations, AI authentication ordering, NOVA AI Worker safety, Hub authorization and tenant boundaries, Remote MCP read-only tools, MT5 relay/proxy, and the Python bridge tenant guard. Reading the workflow is not the same as executing or passing those tests.
- The current checked-in Remote MCP Worker is a JavaScript Cloudflare Worker. The repo README identifies the Python ML examples as research prototypes, not a production model-training pipeline.

### 2.2 Not established by this review

This research did not prove that a specific customer's Exness account is provisioned, that real authenticated account/quote reads succeed, that cross-user access is rejected in the deployed environment, that the live deployment matches main, or that an RL model, LangGraph approval workflow, IBKR adapter, or CCXT adapter is already implemented and tested. Treat these as open verification items until an artifact or test result proves otherwise.

The root README also contains inconsistent hosting notes: it calls Cloudflare the canonical frontend target but has older wording that refers to Vercel for frontend settings/builds. Resolve this in a separate docs/configuration change after verifying the actual workflow and production routes; this research-only change does not switch hosting or deploy anything.

## 3. Recommended target architecture

~~~text
User language
   |
   v
Next.js Zero-Menu UI
   |  Render only allowlisted component types + validated JSON props
   v
Session / Identity boundary (Supabase Auth)
   |
   v
Intent parser (schema validation, clarification, idempotency key)
   |
   v
Deterministic orchestration / state machine
   |-- read-only market/account/strategy tools
   |-- offline backtest and paper-risk evaluation
   |-- optional LangGraph thread + checkpoint when durable pause/resume is needed
   |
   +--> Guardrails (input/output policy and injection defense)
   |
   +--> Deterministic Risk Policy (non-LLM, fail-closed)
   |      Current release: read-only / paper analysis only
   |
   v
NOVA System Integration Hub
   |-- verify user token and tenant/connection ownership
   |-- choose only a server-configured route
   |-- audit event + correlation ID
   |
   +--> Remote MCP Worker (bounded tools; read-only)
   |
   +--> MT5 Read-only Proxy -> tenant route map -> relay -> allocated Windows MT5 terminal
   |
   +--> Future adapters (IBKR / crypto) only after separate approval and readiness gates
   |
   v
Persistence / observability
   |-- Supabase PostgreSQL, RLS, audit and research records
   |-- durable checkpoints only for application state
   |-- optional queue for asynchronous jobs when required
   v
Offline research service
   |-- data quality + chronological backtests
   |-- model registry + walk-forward evaluation
   |-- RL policy training and shadow-mode outputs
~~~

### Responsibility boundaries

- **UI / Generative UI:** Displays narrative, charts, strategy summaries, risk explanations, and approval requests from a local component catalog. It must not execute server-provided JavaScript or accept arbitrary component names/props.
- **Intent layer:** Converts language into a discriminated schema such as market_analysis, get_portfolio_status, draft_strategy, run_paper_backtest, review_risk_settings, or request_demo_connection. Invalid or ambiguous parameters cause a clarifying question; they must not be guessed.
- **Orchestration:** Controls sequence and task status. It may call bounded tools but cannot override authentication, tenancy, risk limits, or capability flags.
- **Guardrails:** NeMo Guardrails or an equivalent policy filter can reduce unsafe prompt/model behavior, but it is defense-in-depth—not the source of truth for authorization or trading risk.
- **Risk engine:** Deterministic code evaluates allowed symbols, strategy state, maximum risk, exposure, drawdown policy, quote freshness, and action permissions. Missing/stale data or unexpected state must fail closed.
- **Integration Hub:** Validates Supabase Auth server-side, resolves ownership on the server, applies allowlisted routes, and reports distinct readiness states: not_configured, configured, reachable, authenticated, data_verified, degraded, unavailable.
- **Broker adapters:** Expose the same normalized read interface where possible, while retaining provider-specific capabilities and constraints. No provider can be assumed to support every instrument, field, session, or order type.
- **Persistence:** Supabase stores application data, ownership-scoped connection metadata, audit events, strategy drafts, evaluation results, and paper-trading records. LangGraph checkpoints store recoverable graph state when LangGraph is actually adopted.
- **Training/inference:** Training and full historical evaluation run outside the latency-sensitive request path. A small policy inference can be a later separate service once evaluated and observed.

## 4. Intent schema and Zero-Menu behavior

Use a strict schema (Zod on the TypeScript side and/or Pydantic on the Python side) with explicit enums, bounds, required fields, and rejection of unknown fields. The server validates again even if the frontend already validated.

Suggested first-release intent families:

| Intent | Effect | Approval / gating |
|---|---|---|
| market_analysis | Read market data and return explanation | No approval; read-only |
| get_portfolio_status | Read the authenticated user's own account/portfolio data | No approval; fresh auth and tenant ownership required |
| draft_strategy | Create or revise a draft only | Save as draft; no activation |
| run_paper_backtest | Run a bounded historical/paper simulation | Validate compute limits and data range; no broker write |
| review_risk_settings | Display current policy and propose a draft change | Human review before saving a policy change; new policy remains within server hard limits |
| request_demo_connection | Create a pending user-owned connection request | Administrative provisioning still required |
| Unsupported/write intents | Place, modify, or cancel a broker order; enable live execution | Must be absent from available v1 tools and denied server-side |

For consequential intents, the UI can render an ApprovalCard or EditCard. The card is a data-only object with a known type and strict props. Approval must bind to an exact action payload, authenticated user, tenant/connection, policy version, creation time, expiry, and one-time idempotency key. An approval card is not a bearer credential and not evidence that the broker is available.

## 5. Risk, security, and tenant isolation

### 5.1 Non-negotiable security controls

1. Validate every protected request's Supabase session server-side. Missing/expired/invalid token returns 401; if authentication cannot be safely verified, fail closed (for example, 503 instead of assuming the user is valid).
2. Resolve connection ownership and tenant route on the server. Never trust a client-supplied user_id, tenant_id, connection_id, or model-generated tool name as proof of authorization.
3. Enforce RLS and least-privilege SQL grants on exposed tables. Supabase docs note that policies do not revoke grants and that the service_role/secret key bypasses RLS; never expose that key to the browser.
4. Store broker_connections metadata and a server-only secret_ref, not raw broker passwords/API secrets in a normal table. Do not write secrets into logs, MCP payloads, prompts, UI props, audit events, or LangGraph checkpoints.
5. Keep one unique bridge token and route entry per tenant/terminal. No fallback to a shared token or default route if mapping is missing.
6. Use a fixed allowlist of upstream routes; reject arbitrary URLs, unknown tools, unsupported symbols/timeframes, and unexpected HTTP methods.
7. Add request size and time limits, rate limits, bounded historical lookback, safe error messages, and correlation IDs. Do not return account payloads from public health checks.
8. Revalidate user authentication, ownership, policy version, quote/data freshness, and action permissions when resuming any paused graph. Never assume the original session is still valid after a long wait.
9. Treat market data, imported documents, external news, tool responses, and user text as untrusted data. Prompt injection defenses do not replace server-side validation.
10. Keep an auditable state transition log: requested -> validated -> allowed/denied -> executed in paper/read-only environment -> result observed. Do not log secrets or unnecessary personal data.

### 5.2 Risk-based pause/resume

LangGraph interrupts can pause a graph and resume it with Command; the checkpointer and thread_id preserve the position of a run. Use this for durable human review where the application genuinely needs it.

- Do not interrupt ordinary read-only quote, chart, or analysis calls.
- Do interrupt before a policy change, a consequential configuration change, or a future write capability—only after such capability has a separately approved security design.
- Keep live order tools unavailable in this release. Approval UX must not accidentally expose order submission.
- Derive the thread identifier server-side from the authenticated session/user-scoped record. Authenticate and authorize before reading, streaming, or resuming thread state; do not expose raw cross-user thread selection.
- Store a minimal approval request in the interrupt payload. Do not include session tokens or secret material.
- Expire old approval requests and make each approval single-use. Re-run policy validation on resume.
- Test restart/refresh/duplicate approve/reject/expired token/expired quote/ownership mismatch/DB outage cases.

### 5.3 NeMo Guardrails role

NeMo Guardrails is a programmable guardrail toolkit for LLM conversation flows. Use it to filter prompt-injection attempts, constrain assistant behavior, and test policy compliance. Still validate all structured intents with code and ensure the broker adapter and risk policy independently enforce their capabilities. A model response such as “approved” must never grant permissions.

## 6. RL research plan: safe first steps

### 6.1 Separate research from execution

Use RL first as a meta-policy for choosing among already-defined strategies, not as an unconstrained order generator. The first valid output should be a research recommendation such as a strategy label, confidence/diagnostics, and a bounded proposed risk multiplier that the deterministic policy can reject. The production output for v1 is informational only.

Keep retrieval-augmented generation (RAG) and reinforcement learning as separate concepts: RAG retrieves relevant documents/context; an RL policy learns from state/action/reward trajectories. They may coexist, but “RL-enhanced RAG” is not a substitute for a measurable reward and evaluation protocol.

### 6.2 Initial observation/state

Use only features that would have been available at the decision timestamp, for example:

- Volatility and range: ATR / normalized ATR, realized volatility, gap and spread proxy where available.
- Trend/regime: ADX, EMA slope/cross states, market structure state, volatility regime.
- Liquidity and execution context: symbol, session, available spread/quotes, data freshness, minimum tick/contract constraints.
- Strategy health: rolling out-of-sample performance, turnover, drawdown, and number of observations; lag/shift these features so they contain no future result.
- Portfolio context for simulation: exposure, recent losses, and risk budget, if consistently available and properly scoped to the account.

Feature construction must specify timeframe, timezone, missing-value handling, exact timestamp, and whether a feature is finalized at bar close or intrabar. Use only completed bars unless a tick-level data path and its latency semantics are explicitly validated.

### 6.3 Action space and hard constraints

For an initial offline meta-controller, actions may choose among a finite registry such as SMC, trend following, or mean reversion, or choose “no strategy / abstain.” Do not include arbitrary broker API calls.

If experimenting with risk weights, define a bounded action set and an absolute risk ceiling in deterministic code. The RL agent must not raise the ceiling, change account ownership, override drawdown stops, select unapproved symbols, or choose an adapter capability that is disabled.

### 6.4 Reward and evaluation

A reward can penalize drawdown, tail risk, excessive turnover, and constraint violations while rewarding risk-adjusted net return. All simulated results must subtract realistic spread, commission, slippage, swap/funding, and other instrument-specific costs when applicable. Report Sharpe/Sortino and maximum drawdown together with net P&L, turnover, trade count, exposure, and downside periods; no single metric is sufficient.

Required evaluation steps:

1. Establish deterministic baselines first (e.g. existing EMA backtest and SMC research tool) and verify their assumptions.
2. Validate OHLCV quality, gaps, duplicates, timezone alignment, symbol mapping, and corporate actions/funding where relevant.
3. Use strictly chronological train/validation/test periods and walk-forward evaluation. Avoid random shuffling of time-series observations. Keep a final untouched holdout.
4. Check for look-ahead bias, feature leakage, survivorship/selection bias, overfitting from repeated tuning, and unrealistic execution assumptions.
5. Compare to simple baselines in multiple regimes and stress periods; include a no-trade policy.
6. Save dataset hash/version, feature schema, policy/code version, hyperparameters, random seed, cost model, evaluation windows, and metric outputs for reproducibility.
7. Run the resulting policy in shadow mode beside the current deterministic signal; log disagreement, latency, invalid actions, abstentions, and policy rejection reasons.
8. Require stable out-of-sample evidence and a review gate before changing any risk policy. No automatic promotion from training to production.

### 6.5 Strategy module acceptance requirements

- **SMC / CHoCH / BOS / Order Blocks / FVG:** Define event rules precisely; distinguish a candidate pivot from a pivot confirmed after right-side bars. Signals may only be emitted once confirmation is knowable at the decision time. Test boundary cases and historical replay.
- **Trend following:** EMA crossover / slope and volatility filters must use timestamp-consistent data, configured warm-up windows, and the appropriate symbol/timeframe.
- **Mean reversion:** Bollinger / RSI divergence rules need explicit regime, session, spread, and volatility constraints. Avoid assuming a reversal simply because a threshold was crossed.
- Each strategy returns a typed signal with timestamp, symbol, timeframe, evidence/features, invalidation level where relevant, and abstention/reason fields. A signal is not an order.
- Do not encode win-rate/return claims such as “93% WR” as a system assumption. Such a number requires a reproducible dataset, definitions, sample size, out-of-sample result, costs, and confidence intervals.

## 7. Multi-broker adapter design

### 7.1 Canonical interface

Define normalized read-oriented interfaces first, for example:

- get_capabilities(connection_ref)
- get_account_summary(connection_ref)
- list_symbols(connection_ref, query)
- get_quote(connection_ref, instrument_ref)
- get_candles(connection_ref, instrument_ref, timeframe, limit)
- get_positions(connection_ref) only when authorized and needed for the read-only portfolio view
- get_health(connection_ref)

Each adapter advertises capabilities explicitly. Standardize timestamps, currency, instrument IDs, quote fields, freshness, and errors. Preserve provider-native symbol IDs; a universal symbol such as BTC/USDT does not guarantee that every venue lists the same instrument or contract.

For any future write adapter, separate its contract and deployment permission from read interfaces. That future contract is excluded from v1 and must remain unreachable from the current tools and frontend.

### 7.2 Rollout order

| Stage | Adapter | Research scope | Gate |
|---|---|---|---|
| 0 | Existing Exness Demo / MT5 | Health, account metadata, symbols, quotes/candles; read-only | End-to-end authenticated read and tenant isolation are proven |
| 1 | Provider-neutral interface | Shared schema, error taxonomy, capability metadata; test doubles only | Contract tests pass without changing active broker routing |
| 2 | IBKR research adapter | Separate IB Gateway/TWS test environment; market data and account reads only | Verify connection handling, entitlements, permissions, contract mapping, pacing, and reconnect behavior |
| 3 | Crypto read adapter | CCXT REST and explicitly supported market-data streams; allowlisted exchanges/symbols | Verify rate limits, symbol precision, exchange-specific semantics and data freshness |
| 4 | Any broker write capability | Not in current scope | Separate threat model, legal/provider review, explicit user approval and dedicated paper-test gates |

### 7.3 Provider notes

- **MT5:** The official MetaTrader5 Python integration communicates with a running MT5 terminal. The terminal/bridge stays on a compatible Windows runtime; do not attempt to run the terminal inside a Cloudflare Worker. The native Python package includes order-sending functionality, so the read-only wrapper must never expose it and tests must assert that write methods are unavailable.
- **IBKR:** IBKR offers several API families; its TWS API uses a TCP socket to TWS or IB Gateway, while the Web API is REST/WebSocket with its own auth and permission requirements. ib_async is a third-party library, not the broker's official API itself. Treat it as an optional wrapper: pin versions, review maintenance, and test the Gateway's session/reconnect/market-data permissions in isolation. Do not assume data for all stocks/options/futures is automatically entitled or available 24/7.
- **Crypto:** CCXT provides normalized exchange REST interfaces and documents exchange-specific rate limits and optional WebSocket stream support. Use a single well-managed exchange instance per credential/session and respect per-endpoint limits. Do not enable private trading methods in this phase. Validate the current installed CCXT package, licenses, exchange coverage, WebSocket support, symbol conventions, market type, precision, and rate limits before choosing the exact deployment.
- **Queues:** Do not add Redis simply because the diagram contains a queue. The current stack is Cloudflare Workers plus Supabase. A Cloudflare Queue or a durable Postgres job record may be enough for an early background workload. Add Redis only if measured throughput/latency/fanout requirements justify a second operational data store. Queues are not a substitute for an idempotent job model and durable audit state.
- **Cloudflare:** Use Workers for the frontend/API/control-plane roles that fit their runtime limits. Train RL models and run expensive historical simulations in a separate Python job/runtime. The Workers limits page documents CPU, memory, and invocation limits that should be checked against the actual account plan and workload before placing compute on the request path.

## 8. Persistence and data model

Suggested logical records—reuse existing migrations/tables after inspection before adding duplicates:

- broker_connections: owner/tenant, provider, opaque connection identifier, bridge route reference, status/readiness fields, capability flags, timestamps, and a server-only secret reference. No plaintext broker credentials.
- user_configs: user-owned preferences and approved bounded settings; do not let user preferences override hard risk policy.
- strategy_drafts: draft params, schema version, author, status and validation results. Draft is not activated code.
- market_data_snapshots / data_sources: provenance, symbol mapping, timestamp, freshness, schema version and dataset hash where applicable.
- paper_runs / paper_trade_logs: simulation inputs, assumptions, fees/slippage model, results and run ID. Do not mislabel simulated records as actual broker trades.
- risk_decisions: allow/deny, policy version, normalized reason codes and correlation ID; never include secrets.
- model_registry / evaluation_runs: training data version/hash, feature schema, code/model version, seed, train/test windows, metrics, approval status and rollback pointer.
- audit_events: append-oriented event timeline with user/tenant reference, action category, decision, timestamp, correlation ID and sanitized metadata.
- LangGraph checkpoint tables: created and maintained through the selected supported checkpoint implementation, not hand-designed as an unrelated duplicate schema. Keep authorization boundaries and retention policies explicit.

Run the current migration inventory and RLS/grant review before creating new tables. Add an explicit owner/tenant RLS test for every newly exposed table and every relevant RPC/view. Review SECURITY DEFINER functions, grants, indexes, retention, and backup/restore behavior.

## 9. Observability and failure behavior

- Use distinct readiness statuses rather than a binary green light. A configured Worker is not proof of a verified broker data path.
- Record safe correlation IDs across UI, Hub, MCP, proxy, relay, and database audit events.
- Track p50/p95 latency for intent validation, LLM/guardrail, data access, backtest job, and UI stream separately.
- Monitor quote age, relay connectivity, Supabase Auth failures, RLS denials, queue retries, dead-letter backlog, model policy version, RL abstention/rejection rate, and model-vs-baseline disagreement.
- On authentication failure, tenant mismatch, stale quote, unknown instrument, missing route, rate limit, or unclear tool result, return an explicit unavailable/denied/needs-clarification state. Never invent a successful account connection.
- Cache public market data carefully with a documented freshness TTL. Do not cache private account responses across users or tenants.
- Do not put LLM inference, NeMo evaluation, RL training, or a long backtest synchronously into every market-data request. Use asynchronous jobs where appropriate and keep the request path bounded.

## 10. Master implementation checklist

### Phase A — verify and baseline (no production behavior changes)

- [ ] Read the actual current migrations, RLS policies, grants, relevant RPCs/views, and table inventory before designing new schema.
- [ ] Confirm the latest main commit and Cloudflare workflow/deployment version; test the currently deployed user-authenticated system, not just a Worker health endpoint.
- [ ] Run existing CI tests and record their actual results and commit SHA.
- [ ] Verify the Exness Demo path: own Supabase session -> own connection row -> allocated route -> relay -> intended MT5 terminal -> live account/quote payload with read-only indicators.
- [ ] Test missing/invalid/expired token, missing route (503), tenant mismatch (403), and connection ID belonging to another user (403 or non-enumerating 404).
- [ ] Confirm all order/write endpoints and MCP tools are absent or explicitly denied. Keep Live Trading OFF.

### Phase B — Zero-Menu intent and UI contract

- [ ] Define the typed intent schema, required/optional parameters, bounds, and supported action registry.
- [ ] Define the local UI component catalog and validate all incoming component types/props.
- [ ] Add a robust “ask a clarifying question” path for ambiguous parameters and schema validation errors.
- [ ] Ensure all actions are authenticated and server-authorized; do not allow UI-generated actions to bypass the Hub.
- [ ] Add request IDs and idempotency keys for draft creation, jobs, and approval state.
- [ ] Test that prompt injection cannot expand tools, override role/tenant, or generate executable frontend code.

### Phase C — durable workflows, if LangGraph is adopted

- [ ] Pin LangGraph and the Postgres checkpoint package versions; verify the current supported AsyncPostgresSaver API and migration/setup instructions.
- [ ] Make the thread ID server-owned and scoped to the authenticated user/session.
- [ ] Persist checkpoints with retention, encryption/DB access controls, and secret redaction.
- [ ] Implement interrupt/resume for draft config or other approved consequential actions; read-only paths remain uninterrupted.
- [ ] On resume, re-check identity, ownership, approval expiry, action payload integrity, current policy version, and data freshness.
- [ ] Test refresh/browser restart, duplicate resume, stale approval, process restart, DB failure, and authorization mismatch.

### Phase D — deterministic strategy and paper-risk baseline

- [ ] Define and unit-test SMC, trend-following, and mean-reversion signal contracts.
- [ ] Review current SMC pivot confirmation and backtest indexing for look-ahead leakage.
- [ ] Ensure all backtests account for available execution costs and document what remains unmodelled.
- [ ] Implement deterministic max-risk, max-drawdown, spread/freshness, exposure, and kill-switch rules for paper evaluation.
- [ ] Compare each strategy with simple baselines on chronological out-of-sample windows.
- [ ] Persist dataset/run versions and results reproducibly.

### Phase E — RL offline and shadow mode

- [ ] Specify state features, allowed discrete actions, abstain action, bounded risk outputs, reward terms, and cost model before training.
- [ ] Implement train/validation/holdout separation and walk-forward evaluation.
- [ ] Compare RL strategy selection against each base strategy, simple rule-based selection, and no-trade.
- [ ] Run stress tests for volatility spikes, poor liquidity, data outages, regime shifts, and increased fees/slippage.
- [ ] Add model/version registration, metrics, rejection logs, policy rollback, and a shadow-mode report.
- [ ] Require human research review; no model auto-promotion and no broker-write capability.

### Phase F — future multi-broker read-only expansion

- [ ] Define normalized adapter capability and instrument metadata schemas with contract tests.
- [ ] Keep Exness/MT5 as the first and only activated adapter until all Phase A tests pass.
- [ ] Add IBKR data-only adapter in an isolated test environment and verify permissions, Gateway/TWS lifecycle, market-data entitlements, pacing, reconnects, and instrument mappings.
- [ ] Add allowlisted CCXT data-only access and test REST/WebSocket support, rate-limit handling, symbol precision, stale-stream detection, and disconnect recovery.
- [ ] Keep provider credentials in approved secret storage; test that neither MCP results, UI payloads, model prompts, logs, nor checkpoints contain secrets.
- [ ] Do not add broker write tools or enable live trading under this plan.

### Phase G — release and ops

- [ ] Build/typecheck/lint/unit-test/security-test in CI and save results tied to exact commit SHA.
- [ ] Run tenant isolation tests in addition to basic positive-path connectivity checks.
- [ ] Add p50/p95 latency, data freshness, relay health, denial, retry, model drift, and shadow-vs-baseline monitoring.
- [ ] Verify deployment version and live routes after an explicitly approved deploy; a successful build alone is not a deployment proof.
- [ ] Prepare rollback instructions and incident runbooks before a production feature rollout.

## 11. Acceptance criteria

This architecture research can be considered implemented only after there is test evidence—not merely code or configuration—for these outcomes:

- Unauthenticated/expired requests are rejected.
- User A cannot read User B's broker connection, checkpoints, portfolio details, or private account response.
- Missing per-tenant route fails closed; no default/shared bridge route is selected.
- The active MT5 path returns an actual, fresh Exness Demo account/quote response for the authenticated owner.
- All v1 broker and MCP paths are read-only; order submission is unreachable, and Live Trading remains OFF.
- The UI renders only approved components from validated data and cannot execute generated code.
- If LangGraph is included, an interrupted run survives refresh/restart and cannot be resumed by another user or after approval expiry.
- RL is evaluated on chronological holdout data with realistic costs and has a monitored shadow comparison; it cannot exceed hard risk rules.
- New adapters pass the same authentication, ownership, freshness, rate-limit, secret-redaction, and capability tests.
- Build, security, and live-runtime evidence is associated with a specific commit/deployment version.

## 12. Research references

References checked on 2026-10-29. Vendor APIs, versions, pricing and limits may change; re-check the exact versions chosen at implementation time.

1. LangGraph interrupts and human-in-the-loop: https://docs.langchain.com/oss/python/langgraph/interrupts
2. LangGraph persistence and checkpointing: https://docs.langchain.com/oss/python/langgraph/persistence
3. LangGraph checkpointer implementations including Postgres / AsyncPostgresSaver: https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/checkpointers.mdx
4. FastMCP server transports (Streamable HTTP versus legacy SSE): https://gofastmcp.com/deployment/running-server
5. FastMCP HTTP deployment, auth, origin protection, session handling and horizontal scaling: https://gofastmcp.com/deployment/http
6. NVIDIA NeMo Guardrails documentation: https://docs.nvidia.com/nemo-guardrails/
7. Supabase Row Level Security, grants and service-role safety: https://supabase.com/docs/guides/database/postgres/row-level-security
8. MetaTrader 5 Python integration: https://www.mql5.com/en/docs/python_metatrader5
9. MetaTrader 5 Python order_send reference (evidence that the native package exposes write capability that the wrapper must not expose): https://www.mql5.com/en/docs/python_metatrader5/mt5ordersend_py
10. Interactive Brokers API overview and TWS API / Web API distinctions: https://www.interactivebrokers.com/docs/
11. ib_async documentation (third-party library interface to TWS/IB Gateway): https://ib-api-reloaded.github.io/ib_async/
12. CCXT manual and exchange rate-limit guidance: https://docs.ccxt.com/docs/manual
13. CCXT Pro stream API documentation: https://docs.ccxt.com/docs/pro-manual
14. Cloudflare Workers resource limits: https://developers.cloudflare.com/workers/platform/limits/
15. Cloudflare Queues limits and behavior: https://developers.cloudflare.com/queues/platform/limits/

## 13. Deep Learning research extension

### 13.1 Position in the NOVA architecture

Deep Learning is an optional signal/feature service, not the orchestration authority and not an execution layer. It must emit a versioned, typed result to the deterministic strategy/risk pipeline. The model may estimate volatility, classify a market regime, rank a finite set of strategy candidates, or produce a calibrated forecast with uncertainty. It must not authenticate users, choose tenant routes, change hard risk limits, or call broker write methods.

Recommended initial order of work:

1. Establish data-quality, feature-timestamp, baseline and walk-forward tests for the existing deterministic EMA/SMC research path.
2. Add a volatility forecast and/or regime classifier as a read-only research output.
3. Compare model-filtered signals against the same strategy without the model filter, using chronological out-of-sample evaluation and realistic costs.
4. Run in shadow mode and log agreement, abstentions, uncertainty, drift and latency.
5. Consider policy use only after repeatable out-of-sample evidence and review; this research does not authorize live execution.

### 13.2 Model families and appropriate use

| Model family | Candidate use | Key limitations / controls |
|---|---|---|
| Temporal Fusion Transformer (TFT) | Multi-horizon forecasts with static, known-future and observed historical covariates; useful when those feature categories are genuinely available | Not inherently robust to regime change; attention/variable-selection outputs are not proof of causal explanation. Compare to simple baselines and recalibrate under drift |
| LSTM / GRU | Sequential features and volatility/regime estimates on a defined timeframe | Bidirectional LSTM may leak future information if used for a live causal prediction; online features must only use observations available at prediction time |
| CNN / temporal convolution | Local patterns in price/indicator sequences | Can overfit repeated patterns and instrument-specific regimes; use walk-forward evaluation |
| Transformer / NLP encoder | Extract time-stamped sentiment or event features from permitted news/text | Avoid look-ahead by using publication/availability time, not the article's event date alone; handle source bias, duplicates and revised articles |
| PPO / SAC / other DRL | Offline research into a finite strategy-selection or allocation policy | Highly sensitive to simulator assumptions, reward design and data leakage; no unrestricted Buy/Sell/Order action in the current production path |

TFT is designed for multi-horizon time-series forecasting and combines recurrent processing with attention and feature-selection components. It should not be assumed to outperform LSTM or to be inherently resilient to regime shifts. Select the smallest model that demonstrates stable incremental value over a well-defined baseline.

For a first Deep Learning release, prioritize volatility/regime estimates over raw price-direction claims. Forecasts should include target definition, horizon, timestamp, model/version, uncertainty or calibration diagnostics, data-freshness status, and abstain reason. Forecast quality does not equal trading profitability.

### 13.3 Output contract and downstream gating

Every model output should conform to a versioned schema similar to:

~~~json
{
  "schema_version": "1",
  "model_id": "registered-model-name",
  "model_version": "immutable-version",
  "symbol": "provider-native-symbol",
  "timeframe": "configured-timeframe",
  "as_of": "UTC timestamp",
  "target": "realized_volatility|regime|strategy_score",
  "horizon": "declared-horizon",
  "prediction": "typed-value-defined-by-target-schema",
  "uncertainty": "optional-calibrated-value",
  "data_freshness": "fresh|stale|unknown",
  "status": "ok|abstain|unavailable"
}
~~~

The illustrative JSON is a contract sketch, not a deployed schema. In implementation, use target-specific discriminated schemas and numeric types/bounds rather than accepting arbitrary values. Reject unknown model IDs, unregistered versions, stale data, missing features, invalid ranges and schema mismatches. Model output goes to a strategy evaluator and then to the existing deterministic Risk Engine; it does not directly invoke an MCP broker-write tool.

### 13.4 Feature engineering and data leakage prevention

- Build features only from data available at the decision timestamp. Record whether each candle is open or finalized and the timestamp/timezone convention.
- For SMC pivots, swings, BOS/CHoCH, Order Blocks and FVG, distinguish a candidate pattern from one confirmed only after future bars. Backtests must not use the confirmation before it was observable.
- For news/NLP, use the first-known publication/ingestion timestamp, deduplicate syndicated copies, and prevent revised text or later sentiment labels from leaking into earlier decisions.
- Fit scalers, imputers, feature selectors and calibration only on the training window; transform validation/test with the frozen training artifacts.
- Split time series chronologically. Use walk-forward folds and apply purging/embargo where label windows overlap or information can cross fold boundaries. The embargo duration must be justified by the maximum label/feature overlap and holding horizon; do not choose a universal arbitrary number.
- Preserve a final untouched holdout. Repeatedly tuning on it invalidates its role as an independent test.
- Test missing bars, duplicate timestamps, market closures, spread spikes, timezone shifts, stale quotes and symbol/contract changes.
- Report data provenance and version/hash alongside every model result.

### 13.5 Evaluation criteria

Use metrics that match the prediction target:

- **Volatility regression:** MAE/RMSE or a suitable robust loss, calibration and coverage of prediction intervals, plus error by regime.
- **Regime classification:** per-class precision/recall, confusion matrix, class imbalance, transition delay and stability—not accuracy alone.
- **Signal filtering:** incremental net performance over the identical unfiltered strategy, with spread/commission/slippage/swap/funding assumptions, turnover, exposure, trade count, drawdown and downside-period analysis.
- **Probabilistic outputs:** calibration and reliability checks; if a threshold drives gating, measure false acceptance and false rejection costs.
- **Operational metrics:** p50/p95 inference latency, missing-feature rate, abstention rate, stale-input rejection, drift alerts and model-version rollback success.

Compare against naive persistence, simple statistical forecasts and the current deterministic strategy. Use paired periods where possible so differences are not explained by different market samples. Report uncertainty and avoid unsupported win-rate claims.

### 13.6 Model lifecycle and safety

- Register model artifacts, training code/version, dependencies, dataset hash, feature schema, label definition, training window, seed, hyperparameters, metrics and review status.
- Pin model/runtime dependencies and verify artifact integrity before loading.
- Keep training and expensive backtests in a separate Python job/runtime; do not place GPU-heavy training in a latency-sensitive Cloudflare Worker request.
- Keep inference isolated behind an authenticated internal interface with bounded inputs, timeouts, concurrency limits and sanitized logs.
- If the model is unavailable, stale, out of distribution, or returns invalid output, abstain and fall back to the deterministic strategy without increasing risk. If the deterministic baseline itself lacks valid fresh data, fail closed.
- Monitor drift and shadow disagreement; support an explicit rollback to a previously reviewed model.
- Do not automatically promote newly trained models to production.
- Do not store secrets or user credentials in training data, prompts, checkpoints or model artifacts.

### 13.7 Deep Learning implementation checklist

- [ ] Inventory current feature/ML code and avoid duplicating existing SMC/EMA implementations.
- [ ] Define target, horizon, prediction timestamp, feature schema and baseline before selecting an architecture.
- [ ] Audit candle and signal indexing for look-ahead leakage.
- [ ] Create chronological train/validation/test and walk-forward folds with appropriate purging/embargo.
- [ ] Establish naive/statistical and existing-strategy baselines.
- [ ] Train a volatility or regime model first; keep direction prediction and DRL as separate experiments.
- [ ] Measure uncertainty/calibration and performance by instrument, timeframe and market regime.
- [ ] Run net-of-cost strategy comparisons and stress tests.
- [ ] Register immutable model/data versions and reproducible evaluation artifacts.
- [ ] Run shadow inference with no broker-write access; observe drift, abstentions, latency and disagreement.
- [ ] Require reviewed evidence before any activation; preserve deterministic hard-risk limits and Live Trading OFF.
- [ ] Add tests for missing/stale inputs, schema errors, unknown model versions, runtime outage and rollback.

### 13.8 Deep Learning references

1. Lim et al., *Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting* (International Journal of Forecasting): https://doi.org/10.1016/j.ijforecast.2021.03.012
2. PyTorch LSTM documentation (including bidirectional configurations): https://pytorch.org/docs/stable/generated/torch.nn.LSTM.html
3. PyTorch GRU documentation: https://pytorch.org/docs/stable/generated/torch.nn.GRU.html
4. Bailey et al., *The Probability of Backtest Overfitting*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253
5. López de Prado, *Advances in Financial Machine Learning* (purging/embargo and financial ML validation background): https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086
6. Stable-Baselines3 PPO documentation: https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html
7. Stable-Baselines3 SAC documentation: https://stable-baselines3.readthedocs.io/en/master/modules/sac.html

## 14. SciSpace literature cross-check and validation additions (2026-10-30)

This section records a focused SciSpace literature search on financial ML evaluation, backtest selection bias, RL generalization, and tool-using-agent authorization. SciSpace is used for paper discovery and metadata; claims below are grounded in the cited publication pages where available. A search result is not itself proof of replication or deployment readiness.

### 14.1 Strategy-selection bias: treat the entire search process as part of the experiment

- Bailey, Borwein, López de Prado and Zhu, *The Probability of Backtest Overfitting* (Journal of Computational Finance, 2017), propose combinatorially symmetric cross-validation (CSCV) to estimate the probability that a strategy selected as best in-sample underperforms out-of-sample. The authors explain why a simple holdout can be unreliable for the strategy-selection problem. DOI: https://doi.org/10.21314/JCF.2016.322
- Bailey and López de Prado, *The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting, and Non-Normality* (The Journal of Portfolio Management, 2014, 40(5), 94–107), address performance inflation from multiple testing and non-normal returns. DOI: https://doi.org/10.3905/JPM.2014.40.5.094
- Practical NOVA implication: retain the complete candidate/parameter-trial count and all tested configurations, report selection-aware evidence (PBO/CSCV where appropriate and DSR with its required inputs), and keep an untouched chronological final holdout. These diagnostics supplement rather than replace realistic execution modelling or prospective paper tests.

### 14.2 Newer objective-function evidence: useful lead, not a transferable guarantee

Sheppert, *The GT-Score: A Robust Objective Function for Reducing Overfitting in Data-Driven Trading Strategies* (Journal of Risk and Financial Management, 2026, 19(1), 60), reports a study using daily OHLCV for 50 S&P 500 companies over 2010–2024, nine sequential walk-forward splits, and 15 random seeds across three strategies. It reports a 98% improvement in its validation/training generalization ratio versus baseline objective functions. DOI: https://doi.org/10.3390/jrfm19010060

Interpretation limits matter: the reported experiments are daily-bar, historical stock-strategy experiments; the paper itself notes limits around asset coverage, no paper/live trading evaluation, and assumptions behind its statistical significance component. It is a research candidate for a later benchmark—not evidence that GT-Score improves Exness XAUUSDM, EMA/RSI, SMC, or any NOVA production strategy. Any local reproduction must pin data/code, fees and assumptions and report results even when they fail to beat the baseline.

### 14.3 Updated minimum validation gate for NOVA strategy, RL, and Deep Learning experiments

Before a strategy, learned filter, or RL policy can be described as robust:

1. Freeze and version the experiment protocol before final evaluation. Log every parameter/configuration trial and avoid selecting the final winner by repeatedly inspecting the final holdout.
2. Split data in chronological order. Fit normalizers, imputers, feature selection and calibration on training data only; apply frozen transforms to later windows. Add explicit point-in-time checks for candle finalization, timestamp/timezone, label maturity, SMC swing/pivot confirmation, news availability time, and order/fill timing.
3. Use rolling walk-forward evaluation, with purge/embargo where label or holding windows overlap. Consider CSCV/PBO for the strategy-selection process and DSR for Sharpe-ratio inference after multiple trials and non-normality are considered.
4. Compare like-for-like against simple baselines, including buy-and-hold and the current deterministic strategy where implemented. Include spread, commission, slippage, swap/funding where applicable, turnover, trade count, exposure, max drawdown and downside-period analysis. Report the instrument, timeframe, sample periods, data source/hash and exact cost assumptions.
5. Treat positive historical metrics as research evidence only. Require prospective paper/shadow results with no broker-write access, track drift and abstentions, and preserve the deterministic risk engine as the final authority. Missing/stale data, unregistered models, schema failures or runtime errors must abstain/fail closed.

The repository README currently says the Backtest page reports a buy-and-hold baseline rather than a strategy backtest. Therefore, neither this literature review nor a benchmark paper can be used to claim that the user's EMA/RSI or SMC strategy has already passed out-of-sample testing.

### 14.4 Agent authorization literature: evidence-quality note

The SciSpace discovery pass also returned several recent 2026 preprints about policy-constrained LLM tool use and agent over-authorization. Because these are very recent and not all are peer-reviewed, they are treated as exploratory leads rather than a production-control authority. NOVA's security design continues to rely on deterministic server-side identity verification, ownership checks, allowlisted tool routes, strict typed schemas, independent risk enforcement, auditable approval bound to an exact payload, and fail-closed behavior. Prompt instructions or an LLM-generated approval state must never grant a capability.

### 14.5 SciSpace and publication references

1. Bailey et al., *The Probability of Backtest Overfitting*, Journal of Computational Finance (2017): https://doi.org/10.21314/JCF.2016.322
2. Bailey and López de Prado, *The Deflated Sharpe Ratio*, The Journal of Portfolio Management (2014): https://doi.org/10.3905/JPM.2014.40.5.094
3. Sheppert, *The GT-Score*, Journal of Risk and Financial Management (2026): https://doi.org/10.3390/jrfm19010060
4. SciSpace search scope (2026-10-30): financial ML robustness/out-of-sample performance; LLM tool-using agent authorization and human approval; temporal leakage, walk-forward validation, PBO and DSR. Papers discovered through semantic search were screened for publication status and applicability; unreviewed preprints are not treated as settled evidence.

## Final decision

Proceed with evidence collection and the Exness Demo read-only path first. The Zero-Menu UI, LangGraph durable workflows, RL meta-policy, and additional broker adapters are staged extensions, not reasons to weaken current authentication, tenant isolation, deterministic risk checks, or the Live Trading OFF boundary. No broker-write capability, production configuration, or deployment is authorized by this research record.
