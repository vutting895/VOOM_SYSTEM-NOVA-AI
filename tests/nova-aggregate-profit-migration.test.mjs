import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/202611110001_nova_aggregate_profit_close.sql", import.meta.url),
  "utf8",
);

test("aggregate profit settings are durable, owner scoped, and disabled by default", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.nova_aggregate_profit_settings/i);
  assert.match(sql, /target_usd numeric\(12,2\) NOT NULL DEFAULT 100\.00/i);
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/i);
  assert.match(sql, /user_id uuid NOT NULL DEFAULT auth\.uid\(\)/i);
  assert.match(sql, /ALTER TABLE public\.nova_aggregate_profit_settings ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /nova_aggregate_profit_settings_select_own[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i);
});

test("authenticated users cannot mutate settings, cycles, or audit rows directly", () => {
  for (const table of ["nova_aggregate_profit_settings", "nova_aggregate_profit_cycles", "nova_aggregate_profit_target_audit"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`GRANT SELECT ON TABLE public\\.${table} TO authenticated`, "i"));
    assert.doesNotMatch(sql, new RegExp(`GRANT (INSERT|UPDATE|DELETE).*public\\.${table}.*authenticated`, "i"));
  }
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.nova_aggregate_profit_settings TO service_role/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.nova_aggregate_profit_target_audit TO service_role/i);
});

test("target updates require the authenticated owner and an Exness Demo connection", () => {
  const start = sql.indexOf("FUNCTION private.nova_set_aggregate_profit_target_impl(");
  const end = sql.indexOf("$function$;", start);
  const body = sql.slice(start, end);
  assert.match(body, /SECURITY DEFINER/i);
  assert.match(body, /SELECT auth\.uid\(\)/i);
  assert.match(body, /bc\.user_id = v_user/i);
  assert.match(body, /bc\.environment = 'demo'/i);
  assert.match(body, /bc\.provider = 'exness_mt5'/i);
  assert.match(body, /p_target_usd > 1000000\.00/i);
  assert.match(body, /scale\(p_target_usd\) > 2/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION private\.nova_set_aggregate_profit_target_impl\(uuid, numeric, text\)[\s\S]*?TO authenticated, service_role/i);
});

test("target edits are deferred during every active close/reconciliation state and audited", () => {
  assert.match(sql, /c\.state IN \('TRIGGERED', 'CLOSING', 'RECONCILING', 'PARTIAL_OR_BLOCKED'\)/i);
  assert.match(sql, /pending_target_usd = p_target_usd/i);
  assert.match(sql, /v_new_version := COALESCE\(v_pending_version, v_version\) \+ 1/i);
  assert.match(sql, /INSERT INTO public\.nova_aggregate_profit_target_audit/i);
  assert.match(sql, /actor_user_id, old_target_usd,\s*requested_target_usd, applied_immediately/i);
});

test("cycle snapshots are owner scoped and only one active cycle can exist", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.nova_aggregate_profit_cycles/i);
  assert.match(sql, /position_ids_snapshot jsonb NOT NULL CHECK \(jsonb_typeof\(position_ids_snapshot\) = 'array'\)/i);
  assert.match(sql, /nova_aggregate_profit_one_active_cycle[\s\S]*?PARTIAL_OR_BLOCKED/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.nova_aggregate_profit_cycles TO authenticated/i);
  assert.doesNotMatch(sql, /GRANT .*UPDATE.*nova_aggregate_profit_cycles.*authenticated/i);
});

test("RPC wrapper is invoker-only and never grants execution capabilities", () => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.nova_set_aggregate_profit_target(");
  const end = sql.indexOf("$function$;", start);
  const wrapper = sql.slice(start, end);
  assert.match(wrapper, /SECURITY INVOKER/i);
  assert.doesNotMatch(wrapper, /SECURITY DEFINER/i);
  assert.match(wrapper, /private\.nova_set_aggregate_profit_target_impl\(/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.nova_set_aggregate_profit_target\(uuid, numeric, text\)[\s\S]*?TO authenticated/i);
  assert.doesNotMatch(sql, /execute_broker_order|place_trade_order|order_submission_enabled\s*=\s*true|liveTradingEnabled\s*=\s*true/i);
});
