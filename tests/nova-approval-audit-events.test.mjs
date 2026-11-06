import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/pending-migrations/202611070001_nova_approval_audit_event_log.sql", import.meta.url),
  "utf8",
);

test("creates an owner-bound approval audit log with immutable event identity and order", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.nova_approval_events/i);
  assert.match(migration, /event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE/i);
  assert.match(migration, /FOREIGN KEY \(approval_id, thread_id, user_id\)[\s\S]*?REFERENCES public\.nova_approval_requests\(id, thread_id, user_id\)/i);
  assert.match(migration, /UNIQUE \(id, thread_id, user_id\)/i);
  assert.match(migration, /CHECK\s*\(\s*event_type IN \('requested', 'approved', 'rejected', 'edited', 'expired', 'cancelled'\)\)/i);
  assert.match(migration, /nova_approval_events_transition_check/i);
});

test("event rows are owner-readable only and cannot be mutated by authenticated clients", () => {
  assert.match(migration, /ALTER TABLE public\.nova_approval_events ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.nova_approval_events FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(migration, /GRANT SELECT ON TABLE public\.nova_approval_events TO authenticated/i);
  assert.match(migration, /nova_approval_events_select_own[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(migration, /nova_approval_events_append_only/i);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.nova_approval_events/i);
});

test("request and terminal events are captured transactionally by database triggers", () => {
  assert.match(migration, /AFTER INSERT OR UPDATE OF status ON public\.nova_approval_requests/i);
  assert.match(migration, /v_event_type := 'requested'/i);
  assert.match(migration, /v_event_type := NEW\.status/i);
  assert.match(migration, /ON CONFLICT \(approval_id, event_type\) DO NOTHING/i);
  assert.match(migration, /actor_type, actor_user_id,[\s\S]*?from_status,[\s\S]*?to_status/i);
  assert.match(migration, /clock_timestamp\(\)/i);
});

test("expiry is system-attributed and edit payload is preserved without becoming approval", () => {
  assert.match(migration, /IF NEW\.status = 'expired' THEN[\s\S]*?v_actor_type := 'system'/i);
  assert.match(migration, /CASE WHEN NEW\.status = 'edited' THEN NEW\.decision_payload ELSE NULL END/i);
  assert.match(migration, /event_type = 'edited'[\s\S]*?to_status = 'edited'/i);
  assert.doesNotMatch(migration, /execute_broker_order|place_trade_order|order_submission_enabled\s*=\s*true|liveTradingEnabled\s*=\s*true/i);
});

test("existing review rows are backfilled without duplicate event identities", () => {
  assert.match(migration, /Backfill requests created before this audit extension/i);
  assert.match(migration, /WHERE a\.status <> 'pending'/i);
  assert.equal((migration.match(/ON CONFLICT \(approval_id, event_type\) DO NOTHING/gi) || []).length, 3);
});

test("service role cannot mutate the audit log and the database blocks TRUNCATE", () => {
  assert.ok(migration.includes("FROM PUBLIC, anon, authenticated, service_role"));
  assert.ok(migration.includes("BEFORE TRUNCATE ON public.nova_approval_events"));
});
