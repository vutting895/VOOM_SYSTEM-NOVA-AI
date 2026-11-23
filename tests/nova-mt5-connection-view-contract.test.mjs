import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261123172541_nova_mt5_customer_connections.sql", import.meta.url), "utf8");
const grantsMigration = readFileSync(new URL("../supabase/migrations/20261124003000_grant_nova_schema_usage_for_mt5_view.sql", import.meta.url), "utf8");
const hub = readFileSync(new URL("../integrations/system-hub/worker.js", import.meta.url), "utf8");

test("NOVA MT5 REST view exposes every field selected by System Hub", () => {
  for (const field of ["id", "user_id", "provider", "environment", "status", "bridge_route_id", "account_label", "last_verified_at", "created_at"]) {
    assert.match(migration, new RegExp("\\b" + field + "\\b"));
    assert.match(hub, new RegExp("\\b" + field + "\\b"));
  }
  assert.match(migration, /security_invoker\\s*=\\s*true/i);
  assert.match(migration, /from\\s+nova\\.mt5_broker_connections/i);
});

test("authenticated users can read and create pending requests through the view, but anonymous users cannot", () => {
  assert.match(migration, /revoke\\s+all\\s+on\\s+public\\.nova_broker_connections\\s+from\\s+public,\\s*anon,\\s*authenticated/i);
  assert.match(migration, /grant\\s+select,\\s*insert\\s+on\\s+public\\.nova_broker_connections\\s+to\\s+authenticated/i);
  assert.doesNotMatch(migration, /grant\\s+.*\\b(update|delete)\\b.*nova_broker_connections/i);
  assert.match(migration, /notify\\s+pgrst,\\s*'reload schema'/i);
});

test("security-invoker view callers have schema USAGE without exposing NOVA schema through the REST API", () => {
  assert.match(grantsMigration, /grant\\s+usage\\s+on\\s+schema\\s+nova\\s+to\\s+authenticated,\\s*service_role/i);
  assert.doesNotMatch(grantsMigration, /grant\\s+usage\\s+on\\s+schema\\s+nova\\s+to\\s+anon/i);
  assert.doesNotMatch(grantsMigration, /grant\\s+.*\\b(create|all)\\b.*schema\\s+nova/i);
});
