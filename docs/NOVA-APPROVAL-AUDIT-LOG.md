# NOVA Approval Audit Event Log

**Status:** review candidate; migration is intentionally kept under `supabase/pending-migrations/`.

## Purpose

The existing `nova_approval_requests` table stores the current terminal result of a strategy-draft review. This extension adds `public.nova_approval_events`, a separate append-only history so creation, decision, edit and expiry events can be inspected independently from the mutable request lifecycle.

## Data and controls

- Events are written by PostgreSQL triggers in the same transaction as request creation or status resolution. A failed request/decision therefore cannot leave a detached audit event.
- Every event is bound to the approval, thread and owner through a composite foreign key.
- Authenticated users receive SELECT only, with RLS filtering by `auth.uid()`. Neither authenticated nor `service_role` receives event mutation grants.
- Database triggers reject event UPDATE/DELETE/TRUNCATE. Erasure cascades through the composite approval/thread/owner foreign key; the guard allows DELETE only after the parent approval row is no longer present. This avoids a broad trigger-depth exception and keeps the cascade path deterministic.
- The schema change, legacy payload-hash backfill, and immutable-trigger rebuild run inside one explicit transaction, so an interrupted migration cannot leave the event table without its guard.
- Event records retain the original canonical proposal hash, status transition, actor type and decision note. For `edited`, the revised JSONB payload is retained with a separate SHA-256 hash calculated by PostgreSQL from its canonical JSONB text.
- Expiry is attributed to `system`; user decisions are attributed to the owning user.
- A unique index prevents duplicate event types for one approval. Historical requests are backfilled once when the extension is applied.

## Boundaries

This is a human review and research-draft audit log. An `approved` event does not authorize broker access, order submission, position mutation, Paper Trading dispatch or Live Trading.

This event log is not a LangGraph checkpoint store. Durable graph state, checkpoint ownership, interrupt/resume and Postgres checkpointer integration remain separate work.

The repository's Production migration lineage is still being reconciled in PRs #231 and #233. Keep this SQL in `pending-migrations`; do not move it into the active migration directory, run `supabase db push`, or apply it to hosted Staging/Production until the lineage is reviewed and a migration timestamp is generated for the accepted sequence.

## Verification

The dedicated GitHub Actions workflow starts a disposable PostgreSQL 17 instance, applies the existing approval lifecycle migration and this candidate, then runs:

- existing approval owner isolation, one-time decision, stale-policy and expiry tests;
- append-only audit, decision attribution, edit payload integrity hash, expiry attribution, replay and account-erasure tests;
- static database contract tests.

These tests do not constitute hosted Supabase acceptance or authorization for a Production migration.
