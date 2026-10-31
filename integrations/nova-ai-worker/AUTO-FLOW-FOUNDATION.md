# NOVA Auto Flow Foundation — draft-only contract

This module is a first M1 foundation slice. It is deliberately a validator, not a runtime.

## Contract
- Schema version: `nova.workflow.v1`.
- Inputs are untrusted, data-only drafts. Unknown keys and unknown node types are rejected.
- Node types are server-owned: `trigger.manual`, `data.select_fields`, `gate.review_required`, and `output.preview`.
- Graphs are bounded, acyclic, fully reachable from one manual trigger, and all nodes must lead to one terminal preview output.
- The validator does not evaluate expressions, execute code, call APIs, resolve credentials, write databases, or authorize actions.
- The normalized result forces `executionMode=draft_only`, `externalEffectsAllowed=false`, `brokerWritesAllowed=false`, and `liveTradingEnabled=false`.

## Limits
- At most 30 nodes and 60 edges.
- At most 5 incoming and 5 outgoing edges per node.
- At most 20 projected field names per projection node.
- Node IDs and projected field names use restricted identifier syntax.

## Local test
Run `npm test` from this directory with Node.js 22+. These tests are local, deterministic, and do not contact production services.

## Deliberate non-goals
No provider actions, arbitrary HTTP, shell, SQL, JavaScript, loops, schedules, queues, durable execution, tenant identity, or approval RPC integration are exposed here. Those require separately reviewed contracts and runtime gates.

## Authenticated AI draft generation (M1 follow-on)

`POST /api/workflows/draft` accepts exactly one JSON field: `prompt` (1–1200 characters). The route requires the existing Supabase bearer authentication used by the Worker. It calls the existing Cloudflare Workers AI binding, then passes the model response through `validateWorkflowDraft` before returning anything to the client.

- Model output is untrusted and never executed.
- Unknown fields, nodes, graph cycles, unreachable nodes, and invalid node configuration are rejected.
- A rejected model draft returns HTTP 422; unavailable AI returns HTTP 503.
- Successful responses remain `draft_only` with external effects, broker writes, and live trading disabled.
- The endpoint does not persist the draft, infer tenant authority from the prompt, call external providers, or create an execution.

This is not Gemini integration: it uses the Worker’s existing Cloudflare Workers AI binding. A Gemini provider can be added only behind the same validator and after separate provider/security review.


## Deterministic Mock Simulator (M3 foundation)

The exported \`simulateWorkflowDraft(draft, sampleData)\` function validates the draft again, accepts only bounded scalar sample data, and returns a stable in-memory trace plus preview output. It supports only the server-owned draft-safe nodes. Review nodes become an approval-required marker; they do not create an approval request.

- No database persistence, queue, schedule, provider call, credential lookup, external side effect, or workflow execution.
- Sample data is limited to 50 scalar fields, 8 KB total, and 500 characters per string; secret-like keys and nested objects/arrays are rejected.
- Output always reports execution, persistence, external effects, broker writes, and Live Trading disabled.
- This is a deterministic contract simulator, not evidence of a deployed runtime or tenant-specific data access.


## Prompt and model-output secret redaction

Before the workflow prompt is forwarded to Cloudflare Workers AI, common credential patterns (Bearer values, key/token/password assignments, JWTs, AWS access-key IDs, GitHub tokens, and API-style secret tokens) are redacted. The same text redaction is applied to user-visible workflow title, description, review reason, and preview label fields returned by the model. This is defense-in-depth, not a substitute for never entering secrets; no guarantee is made that every proprietary credential format is recognized.
