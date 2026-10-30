# NOVA Intent-Driven Generative UI & Agent Orchestration Architecture

- Status: architecture proposal / implementation roadmap; **not implemented or activated by this document**
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `main@ca25d39ee1f58e4d53bc173be268cffc962fcdc4`
- Scope: Zero-Menu customer experience, declarative Generative UI, durable agent workflow, MCP/tool boundary, human review, prompt-injection defense
- Runtime posture: read-only + AI analysis; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## 1. Executive decisions

NOVA should evolve into an **Intent-Driven AI Operating System**, not a collection of independently autonomous agents or a generic broker-command chatbot.

1. The user expresses an intent in chat or voice. NOVA authenticates the session, interprets the request, validates a typed intent, and renders a small set of approved UI components.
2. The model may propose a plan and request approved read-only tools. It never establishes identity, tenant ownership, broker routing, policy authority, or permissions.
3. Keep the existing Next.js frontend, `nova.intent.v1` envelope, NOVA AI Worker, System Integration Hub, Remote MCP Worker, Supabase RLS, and durable approval tables as the initial implementation foundation. Do not build a parallel UI, gateway, MCP endpoint, or approval database.
4. Keep the existing JSON envelope as NOVA's canonical internal UI contract. Add an A2UI or AG-UI adapter only after a compatibility spike demonstrates a concrete need. Neither protocol may introduce executable HTML, JavaScript, arbitrary URLs, or arbitrary component names.
5. Keep the orchestration deterministic initially. Introduce LangGraph only when durable multi-step workflows need checkpoint/resume, branching, retries, or interrupt/resume that cannot be maintained safely by the current application state machine.
6. Keep the existing Cloudflare JavaScript Remote MCP Worker. FastMCP is an option for a future Python tool service, not a replacement mandate for the current Worker.
7. Treat NVIDIA NeMo Guardrails as an optional defense-in-depth policy layer. It does not replace authentication, tenant checks, strict schemas, tool allow-lists, deterministic risk controls, or approval enforcement.
8. Human approval in the current release approves a **research draft only**. Approval must never be interpreted as permission to submit a broker order.
9. No live trading, order submission, broker-side mutation, transfer, withdrawal, or credential entry through chat is in scope. Creating a pending broker-connection request is a separate Supabase state change, not a broker order; it must be excluded from autonomous read-only tool calls and require an explicit owner-confirmed application action.

## 2. Current repository baseline (observed on main)

| Area | Existing foundation | Gap / decision |
|---|---|---|
| Frontend | `frontend/` Next.js 15 / React 19; `frontend/app/chat/page.jsx` | Extend the single app; no second chat app |
| Intent contract | `shared/nova-intent-envelope.schema.json`; `integrations/nova-ai-worker/intent-contract.js` | Existing deterministic classifier and finite component catalog; not yet a general LLM structured-output orchestrator |
| AI provider | NOVA AI Worker; Gemini provider branch is under separate PR review | Keep provider adapter behind the Worker; preserve actual provider provenance |
| Threads / approvals | `frontend/app/api/agent/threads/`, approval APIs, `agent-approval-contract.mjs` | Durable review lifecycle exists in source; approval currently covers strategy draft review only |
| Database | `nova_agent_threads`, `nova_approval_requests`, RLS and RPC migration | No LangGraph checkpoint store is claimed to be implemented |
| MCP | Authenticated Cloudflare `integrations/remote-mcp-worker/`, Streamable HTTP | Existing JavaScript Worker is the primary remote MCP surface |
| Control plane | Existing System Hub, tenant-scoped MT5 proxy/relay | The current Remote MCP broker path does **not** call System Hub: it authenticates the user, reads that user's own connection row with the caller's Supabase bearer (subject to RLS), then calls the MT5 read-only Proxy; the Proxy independently validates owner and tenant route. Hub-mediated broker authorization is a target boundary, not a current MCP guarantee |
| Guardrails | Strict input contracts, auth checks, tool boundaries, risk checks | NeMo Guardrails is not currently asserted as installed or active |
| Persistence | Supabase Postgres, owner-scoped records and approval lifecycle | Chat history remains partly page-memory; durable thread/checkpoint contract needs design and tests |

This table describes checked-in source, not proof of successful production deployment or customer account connectivity.

## 3. Target system architecture

```text
USER
  | natural language / voice / direct UI action
  v
LAYER 1 — ZERO-MENU EXPERIENCE (Next.js / React)
  | authenticated session; accessible chat; fixed component catalog
  | render only validated nova.intent.v1 (optional A2UI/AG-UI adapter)
  v
APPLICATION AUTHORITY BOUNDARY
  | Supabase session verification; owner/tenant context; request limits
  | never trust model-supplied user_id, tenant_id or connection_id as authority
  v
LAYER 2 — AGENT ORCHESTRATION
  | deterministic state machine first; LangGraph only when justified
  | classify -> clarify -> plan -> policy -> tools -> validate -> respond
  | durable state / checkpoint; explicit interrupt and resume for review
  v
POLICY & SAFETY GATE
  | prompt-injection screening + typed schema + component allow-list
  | tenant capability check + deterministic risk rules + audit correlation
  v
LAYER 3 — TOOLING / MCP
  | authenticated application adapter -> System Hub for Hub-mediated operations; existing Remote MCP for its current direct path
  | bounded, named tools; autonomous agent registry is read-only; state-changing connection requests require a separate explicit user action
  v
DATA / CONNECTORS
  | market data | backtest | risk analysis | Exness MT5 Demo read-only
  | future IBKR / CCXT only after separate provider and tenant acceptance
  v
DURABLE STATE / OBSERVABILITY
  | Supabase RLS | thread and approval records | safe checkpoints
  | audit trail | metrics / traces with secrets and sensitive values removed
```

**Authority direction:** UI and model can request; orchestration can coordinate; the authenticated application establishes the principal; Supabase RLS and the MT5 Proxy enforce the current direct-MCP owner/route checks; System Hub enforces only operations that actually pass through it. The current Remote MCP path does not call System Hub. Any future Hub-mediated path must be implemented and tested before architecture or UI claims it is active. No downstream component may elevate the model's permissions.

## 4. Layer 1 — Zero-Menu and Generative UI

### 4.1 User experience

On authenticated entry, NOVA may greet the user and offer useful next actions, such as:
- summarize verified workspace status;
- review a saved strategy draft;
- inspect a market or timeframe;
- check the health of an already-owned broker connection;
- continue an approval that is still pending.

Do not show portfolio balances, account identity, broker health, or personalized performance until an authenticated owner-scoped read succeeds. A greeting is not evidence that account data is available.

The user can type an intent rather than navigate menus. The assistant should ask a focused clarification when required fields are missing or ambiguous. The UI should keep ordinary read-only research low-friction; do not add approval interruptions to every chart or explanation.

### 4.2 Canonical UI envelope

Continue using `nova.intent.v1` as the internal contract. The model returns data only; server-side validation normalizes it into the exact supported shape.

Required rules:
- schema version must be explicit;
- intent and component type must be allow-listed;
- parameters must be bounded and enumerated;
- component parameters must match validated root parameters;
- `executionEnabled` and `liveTradingEnabled` must remain literal `false`;
- reject unknown fields, unknown component types, HTML, JavaScript, event handlers, arbitrary URLs and remote component imports;
- render only locally implemented React components;
- never evaluate or dynamically import model output.

Example conceptual envelope (illustrative, not a new production schema):

```json
{
  "schemaVersion": "nova.intent.v1",
  "intent": "review_risk",
  "parameters": {
    "market": "XAU/USD",
    "timeframe": "1h",
    "risk": "medium"
  },
  "component": {
    "type": "risk_checklist",
    "market": "XAU/USD",
    "timeframe": "1h",
    "risk": "medium",
    "executionEnabled": false,
    "liveTradingEnabled": false
  }
}
```

### 4.3 A2UI / AG-UI decision

Do not replace the current envelope immediately. Build a small compatibility spike that maps the canonical NOVA intent to one candidate protocol and proves:
1. schema validation happens before rendering;
2. the client still renders only the local component catalog;
3. the protocol cannot send executable UI code or bypass user authorization;
4. streaming updates cannot mutate an already-approved proposal without creating a new proposal hash;
5. keyboard, mobile, accessibility, and error states remain usable;
6. the additional protocol does not duplicate existing chat state or approval logic.

Select A2UI or AG-UI only after documenting which protocol better fits the required server-to-client interaction model. Until that decision is reviewed, `nova.intent.v1` remains canonical and the protocol adapter is deferred.

## 5. Layer 2 — Agent orchestration and durable execution

### 5.1 Initial deterministic workflow

Start with an explicit state machine. Suggested states:

`received -> authenticated -> classified -> needs_clarification | planned -> policy_checked -> tool_running -> result_validated -> rendered -> completed`

Failure/terminal states:

`rejected`, `unauthorized`, `rate_limited`, `tool_unavailable`, `expired`, `cancelled`.

Each transition must have:
- an authenticated owner/tenant context created outside the model;
- a correlation ID and idempotency key;
- bounded input/output and a deadline;
- an explicit transition allow-list;
- a sanitized audit event;
- deterministic retry behavior.

Do not let the LLM choose its own next node, change policy state, mark itself authorized, or invent successful tool results.

### 5.2 LangGraph adoption gate

LangGraph is a candidate when a workflow genuinely needs durable graph execution, parallel branches, checkpointed retries, or pause/resume across process restarts. It is not required just because the architecture is agentic.

Before adding it:
- prototype a single read-only workflow and a strategy-review interrupt;
- compare operational complexity with the existing deterministic API/state-machine approach;
- pin and review dependency versions and runtime compatibility;
- verify tenant-scoped checkpoint reads/writes and concurrent resume behavior;
- test replay, duplicate delivery, cancellation, expiration, and provider timeout;
- prove that a thread cannot be resumed by another user;
- document migration, backup, retention, and checkpoint cleanup.

If adopted, use a PostgreSQL checkpoint saver (for example, the supported AsyncPostgresSaver implementation) only after testing it against the actual Supabase Postgres version, connection pooling, transaction semantics, and serverless runtime. Do not assume the saver is installed or that it can safely share the application pool without configuration.

### 5.3 Checkpoint contents and secrets

Persist only the minimum state required to resume:
- thread ID and owner ID (validated against the current session on every resume);
- workflow version and state;
- normalized user intent and bounded tool results;
- proposal hash and approval reference;
- timestamps, retry counters and correlation metadata.

Never persist bearer tokens, Supabase service-role keys, Gemini keys, broker passwords, decrypted Vault payloads, MT5 bridge tokens, raw authorization headers, or unrestricted provider responses. Treat retrieved documents and tool outputs as untrusted data, not system instructions.

## 6. Human-in-the-Loop (HITL)

### 6.1 Current release boundary

The existing approval lifecycle supports a bounded `strategy_draft_review`. The checked-in card/API currently support these terminal decisions:
- **Approve** — accept the research draft for continued analysis only; it does not authorize an account or broker action;
- **Edit** — save a revised draft as `edited`; the revised draft must be submitted as a new review before it can be accepted;
- **Reject** — close the proposal as rejected.

The card's optional **Note** field is attached to one of those decisions. There is no standalone, non-resolving **Respond** action or response API in the current contract. Treat Respond as future work; implement it only with a separate response path that leaves the approval pending, or handle clarification as an ordinary chat turn without silently resolving the approval.

The current database stores an immutable proposal and `proposal_hash`, and the resolver checks the authenticated owner, pending status, expiry and policy version while locking the row and making a pending-to-terminal transition. The current schema does **not** issue, store or validate a one-time decision nonce, and the decision API does not accept an expected proposal hash. Its `invalid_nonce` response mapping is not evidence that nonce validation is active. Add nonce or decision-time hash binding only in a separately reviewed API/schema migration with issuance, persistence, replay protection and regression tests. UI state is not authorization.

### 6.2 Interrupt and resume semantics

If LangGraph is adopted, an interrupt pauses the workflow and returns a review card. On resume:
1. re-authenticate the user;
2. re-load the thread under the current user/tenant scope;
3. re-read the pending approval from the database;
4. apply the current owner, pending-status, expiry and policy-version checks;
5. rely on the database's immutable proposal/proposal-hash fields; do not claim a decision nonce or client-supplied expected-hash check exists today;
6. resume only the permitted research workflow;
7. write an audit event for the decision and resumed transition.

A one-time nonce or explicit expected-hash handshake is a future hardening option, not a current guarantee; it requires a versioned schema/API change and replay tests.

A stale, expired, duplicate, cross-tenant or edited-after-review approval must fail closed.

### 6.3 Future consequential actions are out of scope

A future release that considers broker writes requires a separate architecture decision, security review, explicit user authorization, step-up authentication, independent deterministic risk validation, order-specific approval, idempotent order intent, and verified broker capability. It must not reuse the research-draft approval as an execution authorization. No order tool should be exposed in the current MCP registry or customer UI.

## 7. Layer 3 — Tooling and MCP

### 7.1 Existing MCP boundary

Keep `integrations/remote-mcp-worker/` as the current authenticated Cloudflare Remote MCP endpoint. The frontend must call a same-origin authenticated API or trusted server adapter, not a browser-side local stdio process.

**Observed current Exness path:** `handleMcp()` authenticates the caller. `loadOwnMt5Connection()` then queries `broker_connections` directly using the caller's Supabase bearer and filters `user_id` to the authenticated user's ID. For MT5 reads, the Worker forwards that bearer and the selected `connection_id` to the MT5 read-only Proxy; the Proxy independently enforces its owner/tenant route checks. This current path does not call System Hub. Do not describe Hub as enforcing a request it does not receive.

Each autonomous agent tool call must:
- resolve the authenticated principal from a verified request context;
- use a fixed tool registry and JSON schema;
- enforce per-user/tenant quota before expensive work;
- apply a strict timeout and maximum response size;
- enforce owner and tenant-route checks in the component that actually receives the request (current direct path: caller-scoped Supabase/RLS plus MT5 Proxy; a future Hub-mediated path must verify through Hub);
- return normalized data with provenance and `asOf` timestamp;
- redact secrets and sensitive provider errors;
- write a correlation/audit event;
- reject unknown tool names and arguments.

**Important state-changing exception:** the current registry exposes `request_mt5_demo_connection`. That tool can insert a `pending` row into Supabase `broker_connections`; it is not a broker order, but it is a database write. It must not be included in an autonomous read-only agent tool allow-list. Until the runtime enforces this boundary, an agent must not invoke it automatically. A future connection-request flow must be a separate explicit user-confirmed application action, authenticated and owner-bound, with idempotency, quota and audit controls.

Initial tool groups:
- market data: bounded public quotes/candles;
- research: indicators, SMC, strategy explanation and backtest;
- risk: deterministic paper-risk evaluation;
- broker read-only: own connection status, own account snapshot, own symbols/quotes;
- workspace: list or select an already verified account only through an explicit owner-confirmed application action.

No generic URL fetch, arbitrary host/port, model-controlled route, shell, filesystem, credential retrieval, order, position mutation, transfer, withdrawal, deposit, or live-execution tool.

### 7.2 FastMCP decision

FastMCP Streamable HTTP is appropriate if a future Python service needs to expose Python-native research tools or libraries through MCP. It should be deployed as a separately authenticated service behind the existing application/Hub boundary, not as a new public gateway.

Before adoption, prove:
- token/session propagation without trusting model-provided identity;
- tenant and tool-level authorization;
- Streamable HTTP protocol compatibility and origin policy;
- per-tool schemas, timeout, concurrency and rate limits;
- no secret exposure in tool results or logs;
- no duplicate implementation of tools already provided by the Cloudflare Worker.

Do not port the existing JavaScript Worker to FastMCP just to standardize frameworks.

## 8. Prompt-injection and output guardrails

Use defense in depth, with deterministic controls as the enforcement layer.

1. **Input boundary:** size limits, content-type validation, credential-pattern rejection/redaction and prompt-injection screening on every model-bound field.
2. **Instruction separation:** user text, retrieved documents, MCP results and external web content are untrusted data; none may override system policy or tool permissions.
3. **NeMo Guardrails candidate:** evaluate Colang policies for allowed conversation flows, disallowed requests and response constraints. Run it as an additional policy service or library only after a compatibility, latency, dependency and fail-closed test. Do not place it as the sole authorization control.
4. **Tool gate:** deterministic tool allow-list, JSON schema, capability checks, ownership and quota checks immediately before dispatch.
5. **Output gate:** validate intent envelope, UI component, numeric ranges, provider provenance and response length before rendering.
6. **Audit:** record policy version, decision code, tool name, correlation ID and outcome; do not store secrets or full sensitive prompts.
7. **Adversarial tests:** prompt injection in chat, retrieved files, tool output, strategy summaries and multilingual content; attempts to request credentials, cross-tenant data, hidden tools, raw HTML/JS, arbitrary URLs or execution.

NeMo policy outcomes must never grant a capability that the Hub, database or tool registry does not already permit.

## 9. Data model and service contracts

Reuse existing `nova_agent_threads` and `nova_approval_requests`. Do not create a parallel chat/approval database.

If durable orchestration is approved, propose a reviewed additive schema or saver-owned tables with:
- checkpoint ID and parent checkpoint ID;
- thread ID and owner ID;
- workflow/graph version;
- encrypted or minimized checkpoint payload (no credentials);
- creation/expiry timestamps and retention metadata;
- uniqueness/idempotency constraints for concurrent writes.

RLS and grants must ensure users can only read their own thread/checkpoint records. If the selected checkpoint saver requires privileged server access, keep it server-only and independently assert ownership before every read, write, resume, or delete. Do not expose checkpoint tables directly to browser clients.

Use versioned API contracts for:
- `POST /api/agent/intent` — validate and enqueue/execute a bounded intent;
- `POST /api/agent/threads` and `GET /api/agent/threads` — owner-scoped thread lifecycle;
- `POST /api/agent/threads/:id/approvals` — create a research-draft review;
- `POST /api/agent/approvals/:id/decision` — resolve the exact pending proposal;
- internal-only tool adapter — call the existing Hub/MCP registry.

These are target contracts, not claims that every route exists today. Reuse current endpoints where their behavior already matches; do not create duplicates.

## 10. Proposed repository structure

Extend existing directories instead of creating another application or gateway:

```text
frontend/
  app/
    chat/                         # canonical Zero-Menu surface
    api/agent/                    # authenticated agent and approval routes
  components/
    agent/                        # fixed, allowlisted UI catalog
    approval-card.jsx             # existing review card
  lib/
    agent/
      intent-schema.mjs           # canonical intent validation
      workflow-machine.mjs        # deterministic orchestration first
      policy-gate.mjs             # deterministic policy adapter
      tool-registry.mjs           # typed, allowlisted tools
      checkpoint-store.mjs        # only if durable graph is approved
      protocol-adapter.mjs        # optional A2UI/AG-UI compatibility
integrations/
  nova-ai-worker/                 # provider adapter and model boundary
  remote-mcp-worker/              # existing Cloudflare MCP tools
  system-hub/                     # identity, tenant and broker control plane
  future-python-research-mcp/     # only if FastMCP is justified
shared/
  nova-intent-envelope.schema.json
  agent-tool-schemas/             # versioned tool request/response schemas
supabase/
  migrations/                     # additive, reviewed durable state changes
tests/
  agent-workflow/                 # replay, resume, idempotency and timeout
  generative-ui/                  # schema and component allow-list
  prompt-injection/               # adversarial corpus
  tenant-isolation/               # two-user/thread/checkpoint/tool tests
```

This is a proposed organization. Do not create placeholder directories or move existing files until an implementation PR is scoped and references are inventoried.

## 11. Delivery roadmap and acceptance gates

### Phase A — Contract and threat model (documentation only)
- [ ] Review this architecture with existing Zero-Menu and Multi-Broker research.
- [ ] Map each proposed responsibility to a real existing module and owner.
- [ ] Freeze the canonical intent, tool, approval and provenance contracts.
- [ ] Record unresolved decisions for A2UI vs AG-UI, LangGraph adoption, FastMCP need and NeMo deployment.
- [ ] ChatGPT review before merge.

### Phase B — Safe deterministic orchestration
- [ ] Implement a typed workflow state machine using current runtime dependencies.
- [ ] Add owner-scoped intent API and bounded clarification/response contracts.
- [ ] Add idempotency, cancellation, timeout, audit and per-user quota tests.
- [ ] Test cross-user thread and connection denial.
- [ ] Keep all tools read-only.

### Phase C — Durable checkpoint / HITL
- [ ] Prototype LangGraph only if Phase B demonstrates a durable graph requirement.
- [ ] Verify AsyncPostgresSaver compatibility and tenant-safe checkpoint persistence.
- [ ] Implement interrupt/resume for strategy-draft review only.
- [ ] Test duplicate resume, expired approval, changed proposal, stale policy and cross-tenant resume.
- [ ] Verify checkpoint payload contains no secrets.

### Phase D — Guardrails and MCP hardening
- [ ] Add adversarial prompt-injection corpus and deterministic policy gate.
- [ ] Evaluate NeMo Guardrails as a supplemental layer with fail-closed behavior.
- [ ] Keep existing Remote MCP Worker; add FastMCP only for a justified Python tool workload.
- [ ] Verify per-user quota, output schemas, provenance and sanitized audit.

### Phase E — Generative UI protocol and customer experience
- [ ] Prototype A2UI/AG-UI adapter against the canonical envelope.
- [ ] Verify local component allow-list, accessibility, streaming and safe error states.
- [ ] Add proactive greeting using only verified data; no invented account status.
- [ ] Test desktop/mobile split-view and workspace-specific UI isolation.

### Release gate
A phase is not complete based on documentation or unit tests alone. Require exact-head CI, security review, two-user isolation evidence, preview verification and deployed runtime evidence where applicable. No production secrets, Supabase writes, broker route changes, live provider activation or deployment are part of this design document.

## 12. Explicit non-goals

- No automatic live trading or order submission.
- No LLM authority over tenant identity, broker route, account ownership, risk limits or approval state.
- No model-generated executable UI, plugin installation, shell command or arbitrary HTTP request.
- No parallel frontend, duplicate MCP gateway, duplicate approval database or plaintext credential store.
- No forced adoption of LangGraph, FastMCP, A2UI, AG-UI or NeMo without a passing proof-of-fit.
- No claim that these components are already installed, deployed or production-ready.

## 13. Relationship to existing architecture documents

- `docs/research/NOVA-ZERO-MENU-RL-MULTIBROKER-RESEARCH.md` remains the research record and initial recommendation.
- `docs/architecture/NOVA-CUSTOMER-MULTIBROKER-AUTOCONNECT.md` remains the broker connection and tenant lifecycle design.
- `docs/NOVA-DELIVERY-VERIFICATION-ACTIVATION-PLAN.md` remains the mandatory delivery and activation gate.
- This document connects those designs into a single Zero-Menu / Generative UI / Agent / MCP architecture and defines the staged implementation decisions.

