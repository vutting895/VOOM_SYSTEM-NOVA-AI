import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql", import.meta.url),
  "utf8",
);

test("creates owner-scoped thread and approval tables with RLS and least-privilege grants", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.nova_agent_threads/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.nova_approval_requests/i);
  assert.match(sql, /ALTER TABLE public\.nova_agent_threads ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /ALTER TABLE public\.nova_approval_requests ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /nova_agent_threads_select_own[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /nova_approval_select_own[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.nova_agent_threads TO authenticated/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.nova_approval_requests TO authenticated/i);
  assert.doesNotMatch(sql, /GRANT UPDATE ON TABLE public\.nova_approval_requests TO authenticated/i);
});

test("only the approved research-draft type and versioned proposal schema are allowed", () => {
  assert.match(sql, /request_type text NOT NULL CHECK \(request_type = 'strategy_draft_review'\)/i);
  assert.match(sql, /nova\.approval\.v1|nova-approval\.v1/);
  assert.match(sql, /private\.nova_valid_strategy_draft_proposal/i);
  assert.ok(sql.includes("p_proposal_hash !~ '^[a-f0-9]{64}$'"), "client-provided hash must be format-checked");
  assert.ok(sql.includes("encode(extensions.digest(convert_to(p_proposal::text, 'UTF8'), 'sha256'), 'hex')"), "persisted hash must be calculated server-side from canonical JSONB");
  assert.match(sql, /nova_one_pending_approval_per_thread[\s\S]*?WHERE status = 'pending'/i);
  assert.match(sql, /FOREIGN KEY \(thread_id, user_id\)[\s\S]*?REFERENCES public\.nova_agent_threads\(id, user_id\)/i);
});

test("private mutation implementations bind to auth.uid and check owner/state/expiry/policy", () => {
  for (const fn of ["nova_create_approval_impl", "nova_resolve_approval_impl"]) {
    const start = sql.indexOf(`FUNCTION private.${fn}(`);
    assert.notEqual(start, -1, `missing private.${fn}`);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1, `unterminated private.${fn}`);
    const body = sql.slice(start, end);
    assert.match(body, /SECURITY DEFINER/i);
    assert.match(body, /SELECT auth\.uid\(\)/i);
    assert.match(body, /user_id\s*=\s*v_user/i);
  }
  assert.match(sql, /v_row\.status <> 'pending'/i);
  assert.match(sql, /v_row\.expires_at <= now\(\)/i);
  assert.match(sql, /p_policy_version <> 'nova-approval\.v1'/i);
  assert.match(sql, /SET state='active'/i);
});

test("public PostgREST functions are SECURITY INVOKER wrappers only", () => {
  for (const name of ["nova_create_approval", "nova_resolve_approval"]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.notEqual(start, -1);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1);
    const wrapper = sql.slice(start, end);
    assert.match(wrapper, /SECURITY INVOKER/i);
    assert.doesNotMatch(wrapper, /SECURITY DEFINER/i);
    assert.match(wrapper, new RegExp(`private\\.${name}_impl\\(`, "i"));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^]*FROM PUBLIC, anon;`, "i"));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^]*TO authenticated;`, "i"));
  }
});

test("approval proposal is immutable and terminal decisions cannot be replayed", () => {
  assert.match(sql, /nova_approval_guard_update/i);
  assert.match(sql, /nova_approval_immutable_fields/i);
  assert.match(sql, /OLD\.status <> 'pending'/i);
  assert.match(sql, /NEW\.decided_at := now\(\)/i);
  assert.match(sql, /UPDATE public\.nova_approval_requests a[\s\S]*?a\.status='pending'/i);
  assert.match(sql, /status=v_status/i);
  assert.match(sql, /decision_payload=CASE WHEN p_decision='edit' THEN p_decision_payload ELSE NULL END/i);
});

test("migration never adds broker order, execution or Live Trading capabilities", () => {
  assert.doesNotMatch(sql, /execute_broker_order|place_trade_order|order_submission_enabled\s*=\s*true|liveTradingEnabled\s*=\s*true/i);
});
test("private mutation implementations bind to auth.uid and check owner/state/expiry/policy", () => {
  for (const fn of ["nova_create_approval_impl", "nova_resolve_approval_impl"]) {
    const start = sql.indexOf(`FUNCTION private.${fn}(`);
    assert.notEqual(start, -1, `missing private.${fn}`);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1, `unterminated private.${fn}`);
    const body = sql.slice(start, end);
    assert.match(body, /SECURITY DEFINER/i);
    assert.match(body, /SELECT auth\.uid\(\)/i);
    assert.match(body, /user_id\s*=\s*v_user/i);
  }
  assert.match(sql, /v_row\.status <> 'pending'/i);
  assert.match(sql, /v_row\.expires_at <= now\(\)/i);
  assert.match(sql, /p_policy_version <> 'nova-approval\.v1'/i);
  assert.match(sql, /SET state='active'/i);
});

test("public PostgREST functions are SECURITY INVOKER wrappers only", () => {
  for (const name of ["nova_create_approval", "nova_resolve_approval"]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.notEqual(start, -1);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1);
    const wrapper = sql.slice(start, end);
    assert.match(wrapper, /SECURITY INVOKER/i);
    assert.doesNotMatch(wrapper, /SECURITY DEFINER/i);
    assert.match(wrapper, new RegExp(`private\\.${name}_impl\\(`, "i"));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^]*FROM PUBLIC, anon;`, "i"));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^]*TO authenticated;`, "i"));
  }
});

test("approval proposal is immutable and terminal decisions cannot be replayed", () => {
  assert.match(sql, /nova_approval_guard_update/i);
  assert.match(sql, /nova_approval_immutable_fields/i);
  assert.match(sql, /OLD\.status <> 'pending'/i);
  assert.match(sql, /NEW\.decided_at := now\(\)/i);
  assert.match(sql, /UPDATE public\.nova_approval_requests a[\s\S]*?a\.status='pending'/i);
  assert.match(sql, /status=v_status/i);
  assert.match(sql, /decision_payload=CASE WHEN p_decision='edit' THEN p_decision_payload ELSE NULL END/i);
});

test("migration never adds broker order, execution or Live Trading capabilities", () => {
  assert.doesNotMatch(sql, /execute_broker_order|place_trade_order|order_submission_enabled\s*=\s*true|liveTradingEnabled\s*=\s*true/i);
});
