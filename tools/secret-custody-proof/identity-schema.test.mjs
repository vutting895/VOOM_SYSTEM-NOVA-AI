import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../../supabase/migrations/202610270001_mt5_customer_connections.sql", import.meta.url);

test("canonical broker connection ownership is user_id with owner-only RLS; no tenant_id is assumed", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.broker_connections/i);
  assert.match(sql, /user_id uuid not null default auth\.uid\(\) references auth\.users\(id\)/i);
  assert.match(sql, /unique\s*\(user_id\s*,\s*provider\s*,\s*environment\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(sql, /\btenant_id\b/i);
});
