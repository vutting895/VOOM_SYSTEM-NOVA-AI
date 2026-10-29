import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../supabase/migrations/202610290001_security_definer_marketplace_hardening.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const publicFunctions = [
  "voom_marketplace_list_strategies",
  "voom_marketplace_my_subscriptions",
  "voom_marketplace_pause",
  "voom_marketplace_subscribe",
];

test("moves each privileged Marketplace implementation into private", () => {
  for (const name of publicFunctions) {
    assert.match(
      sql,
      new RegExp(
        `ALTER FUNCTION public\\.${name}\\([^]*\\)\\s+SET SCHEMA private;`,
        "i",
      ),
      `expected public.${name} to be moved into private`,
    );
    assert.match(
      sql,
      new RegExp(`RENAME TO ${name}_impl;`, "i"),
      `expected private implementation rename for ${name}`,
    );
  }
});

test("exposes only SECURITY INVOKER wrappers for authenticated API roles", () => {
  for (const name of publicFunctions) {
    const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
    assert.notEqual(start, -1, `missing public wrapper for ${name}`);
    const end = sql.indexOf("$function$;", start);
    assert.notEqual(end, -1, `unterminated wrapper for ${name}`);
    const body = sql.slice(start, end + "$function$;".length);
    assert.match(body, /SECURITY INVOKER/i, `${name} must be SECURITY INVOKER`);
    assert.doesNotMatch(body, /SECURITY DEFINER/i, `${name} must not be SECURITY DEFINER`);
    assert.match(body, new RegExp(`private\\.${name}_impl\\(`, "i"));
  }
});

test("does not grant anonymous or PUBLIC execution to the API or implementation functions", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.voom_marketplace_list_strategies\(\)\s+FROM PUBLIC, anon;/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.voom_marketplace_my_subscriptions\(\)\s+FROM PUBLIC, anon;/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.voom_marketplace_pause\(uuid\)\s+FROM PUBLIC, anon;/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.voom_marketplace_subscribe\(uuid, uuid, text\)\s+FROM PUBLIC, anon;/i);
  assert.match(sql, /GRANT USAGE ON SCHEMA private TO authenticated, service_role;/i);
  assert.match(sql, /REVOKE USAGE ON SCHEMA private FROM anon;/i);
});

test("tightens staff helper search_path and reloads PostgREST schema cache", () => {
  assert.match(sql, /ALTER FUNCTION private\.is_active_staff\(\)\s+SET search_path TO pg_catalog;/i);
  assert.match(sql, /NOTIFY pgrst, 'reload schema';/i);
});

test("does not delete application tables or mutate customer trading records", () => {
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\.(broker_connections|trading_sessions|customer_ai_subscriptions)\b/i);
});
