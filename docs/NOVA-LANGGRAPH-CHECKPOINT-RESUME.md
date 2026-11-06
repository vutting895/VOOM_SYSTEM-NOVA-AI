# NOVA LangGraph Approval Checkpoint and Resume

**Status:** implementation scaffold added; runtime remains disabled until the pinned dependencies and lockfile are installed and PostgreSQL acceptance completes.

## Separation of responsibilities

- `public.nova_approval_requests` remains the owner-scoped current Approval record.
- `public.nova_approval_events` remains the append-only human-review audit history.
- `nova_langgraph_private` is a separate, non-Data-API schema reserved for LangGraph checkpoint tables. Checkpoint state is not stored in the Approval Audit table.
- The Express API validates the Supabase user JWT, loads the user's owned thread/approval, and only then derives a checkpointer thread key.

## Checkpoint identity and tenant isolation

The public Supabase thread UUID must never be sent directly to LangGraph as its checkpoint thread ID. The runtime derives an opaque, deterministic HMAC-SHA256 ID from:

`user_id : app_thread_id : approval_id`

using the backend-only `NOVA_LANGGRAPH_THREAD_ID_SECRET`. The same owner/thread/approval produces the same ID for recovery; a different user or approval produces a different ID. The HMAC secret must be stable across restarts and have at least 32 UTF-8 bytes. Rotating it intentionally makes existing checkpoint IDs unreachable, so rotate only with an explicit checkpoint migration/retention plan.

## Interrupt / resume sequence

1. The Approval RPC creates the review row. The existing SQL trigger records the `requested` Audit Event in the same transaction.
2. When `NOVA_LANGGRAPH_ENABLED=true`, the Express API starts a graph using the owner-verified row and the derived HMAC thread ID.
3. The graph runs one `await_human_review` node and calls LangGraph `interrupt()`. It contains no broker, order, position or execution node.
4. The owner resolves the Approval through `nova_resolve_approval`. The SQL trigger appends `approved`, `rejected` or `edited` before the API attempts resume.
5. Resume uses `Command({ resume })` with the exact `approvalId`, original `proposalHash`, persisted terminal status and note. The runtime rejects a mismatched approval/hash, unsupported status, extra resume fields or an oversized note.
6. If the Approval transaction committed but LangGraph resume failed, the API returns `checkpoint.status=resume_required`. The owner-scoped `POST /api/agent/approvals/:approvalId/graph/resume` recovery route reloads the terminal Approval and its matching Audit Event from Supabase; it does not accept a decision from the request body.
7. `edited` resumes as `edited`, not `approved`; a new, separate review request is required. `expired` can also resume with the system event. No outcome grants broker authority.

## PostgreSQL checkpoint store

The runtime uses `PostgresSaver.fromConnString(connectionString, { schema: "nova_langgraph_private" })` followed by `await checkpointer.setup()`. The official saver implementation creates the requested schema when it is absent, then creates/updates its checkpoint tables and runs the checkpointer's schema migrations. The connection role therefore needs permission to create the schema on first use, or the schema must be pre-created and owned/granted to that role. LangGraph checkpoint rows are not exposed through the public Supabase Data API.

Provision a dedicated backend-only PostgreSQL login for this schema before enabling the feature. The role must not own or mutate `public.nova_approval_requests`, `public.nova_approval_events`, broker tables or application schemas. Do not point the checkpointer at the public schema or reuse the Supabase service-role key. Provision the login and credentials out-of-band; the example below assumes that role already exists. Execute only in a disposable local DB until separately reviewed:

```sql
CREATE SCHEMA IF NOT EXISTS nova_langgraph_private
  AUTHORIZATION nova_langgraph_checkpointer;
REVOKE ALL ON SCHEMA nova_langgraph_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA nova_langgraph_private TO nova_langgraph_checkpointer;
```

The saver runs its own migrations in this schema during `setup()`; grant the dedicated owner only the schema privileges needed to create and maintain those checkpoint tables. Do not grant it privileges on any application or broker schema. Checkpoint writes are awaited as part of `graph.invoke()`, so the API must await each invocation before returning.

Set backend-only secrets:

- `NOVA_LANGGRAPH_ENABLED=false` until runtime acceptance is complete.
- `NOVA_LANGGRAPH_DATABASE_URL` — connection string for the restricted checkpointer role; it must explicitly include `?sslmode=require`, `?sslmode=verify-ca` or `?sslmode=verify-full`. Runtime startup fails closed if TLS mode is missing or disabled. Never expose this string to the browser or Supabase Data API.
- `NOVA_LANGGRAPH_THREAD_ID_SECRET` — stable random HMAC secret of at least 32 bytes.

The checkpointer exposes `deleteReviewCheckpoint()`, which calls the saver’s `deleteThread()`. Account/thread/approval erasure workflows must call it for the derived ID before the HMAC secret is discarded. The current user/Approval deletion routes do not yet own the account-erasure workflow, so automated retention/erasure acceptance is still required before production use.

## Dependency and CI gate

The current root `bun.lock` does not contain LangGraph packages. The validation environment currently has no working Bun install, Docker daemon or writable C: disk, and GitHub Actions jobs are failing before runner allocation. To avoid committing a package manifest that does not match its lockfile, this branch does not yet enable or install the new packages.

Candidate exact versions to resolve and then pin together with the generated `bun.lock`:

- `@langchain/langgraph@1.6.1`
- `@langchain/langgraph-checkpoint-postgres@1.1.2`

These are candidate exact pins to validate together, not installed dependencies. The current npm registry also lists LangGraph 1.7.1, published only hours before this review, so the branch deliberately does not chase a just-published version without a compatibility run. The PostgreSQL saver 1.1.2 uses node-postgres internally; resolve the matching checkpoint/core peer dependency tree from the package manifests during the next disk-capable installation. Commit the resulting `bun.lock` in the same change. Do not use floating `latest` tags. The feature flag remains off by default, and the runtime reports a controlled unavailable status while these packages are missing.

Before enabling the flag, CI must prove all of the following on a disposable PostgreSQL 17 database:
- graph interrupts persist across process restart and resume using the exact same HMAC thread ID;
- User A cannot read, resume or delete User B's checkpoint;
- replay of the same terminal decision is idempotent;
- a forged `approvalId`, `proposalHash`, status or extra resume field is rejected;
- `edited` never becomes `approved`;
- `deleteThread()` removes checkpoint history for account/thread erasure;
- no graph node or resume path can invoke broker/order/Live Trading behavior.

No hosted schema, account, broker connection, order or Live Trading setting was changed by this implementation.
