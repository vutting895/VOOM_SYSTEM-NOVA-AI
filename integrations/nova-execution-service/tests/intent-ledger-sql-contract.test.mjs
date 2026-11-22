import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../sql/intent-ledger.proposed.sql", import.meta.url), "utf8");

test("SQL is clearly marked as a proposal and not an applied migration", () => {
  assert.match(sql, /PROPOSAL ONLY/);
  assert.match(sql, /No production database has been changed/);
});

test("intent ledger is Demo-only, tenant-keyed and idempotent", () => {
  assert.match(sql, /environment = 'demo'/);
  assert.match(sql, /unique \(user_id, idempotency_key\)/);
  assert.match(sql, /request_hash ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql, /on conflict \(user_id, idempotency_key\) do nothing/);
  assert.match(sql, /'created'/);
  assert.match(sql, /'replayed'/);
  assert.match(sql, /'conflict'/);
});

test("browser roles cannot access execution ledger tables or RPC", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.nova_execution_intents from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.nova_execution_audit_events from anon, authenticated/);
  assert.match(sql, /revoke all on function public\.nova_create_execution_intent[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
});

test("function is invoker-security and not SECURITY DEFINER", () => {
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/);
});

test("intent and audit data are constrained and no broker action is present", () => {
  assert.match(sql, /stop_loss numeric[\s\S]*check \(stop_loss > 0\)/);
  assert.match(sql, /take_profit numeric[\s\S]*check \(take_profit > 0\)/);
  assert.match(sql, /foreign key \(intent_id, user_id\)/);
  assert.match(sql, /jsonb_typeof\(details\) = 'object'/);
  assert.doesNotMatch(sql, /http|pg_net|net\.http|order_send|mt5_execute/i);
});
