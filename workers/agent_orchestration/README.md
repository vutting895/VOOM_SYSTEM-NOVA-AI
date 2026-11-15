# NOVA Agent Orchestration Contracts

This package is the first, dependency-free contract layer for Issue #104. It does
not implement a LangGraph runtime, call an LLM, connect to MCP, access Supabase,
or expose broker execution.

## Boundary

- A future authenticated application adapter must derive the user/tenant and
  resolve owner-scoped resources. Model output cannot provide identity, tenant,
  connection, route or upstream destination values.
- Tool definitions are server-owned and allowlisted. A model may request only a
  tool already present in that registry.
- V1 permits read-only tools and human-review-gated draft writes. External writes
  and broker writes are rejected, including broker tools hidden behind an approval
  flag.
- `request_mt5_demo_connection` is a database state change and is not an
  autonomous read-only tool; it remains a separate explicit user-confirmed action.
- Tool arguments are bounded JSON. Credential-like and server-owned fields are
  rejected before any future tool adapter receives them.
- Run state is a minimal checkpoint contract. It deliberately excludes the chat
  transcript, user/tenant identity, broker credentials, tokens, connection IDs,
  route IDs, raw provider payloads and tool implementation objects.
- A future checkpoint loader must authenticate the current session and verify
  owner access to the existing NOVA thread before reading/resuming a checkpoint.
- A pending approval checkpoint stores only the approval ID, immutable proposal
  hash, and approval policy version. It never stores the authenticated owner ID
  or token.
- approval_resume.py validates a server-loaded approval snapshot against the
  current authenticated owner, checkpoint thread, pending approval ID, proposal
  hash, policy version, decision status and expiry before a future graph resume
  command. This is a pure contract validator; it does not create or connect to an
  approval store, call Supabase, or resume LangGraph itself.
- Tool calls carry application-generated call and idempotency IDs. Retry budgets
  are bounded, and non-idempotent calls cannot be configured for retries.

## Limits

The current defaults cap a run at 12 steps, a tool timeout at 20 seconds, retries
at 2, and a serialized tool-argument payload at 8 KiB. These are conservative
contract limits, not a statement about provider or LangGraph runtime limits.

## Validation

Run from the repository root:

```bash
python -m unittest discover -s tests -p 'test_agent_orchestration_contracts.py' -v
python -m compileall -q workers/agent_orchestration
```

## Not yet implemented

LangGraph nodes/checkpointer, tool execution, the API-to-graph approval adapter,
AG-UI/SSE, MCP client integration, tracing backend, checkpoint database schema,
retention/backup policy and production deployment remain separate milestones
under Issue #104. The resume validator does not provide durable replay protection;
the future approval persistence layer must provide an owner-scoped, atomic
one-time decision/consume transition. No such durable adapter is implemented
by this package.
