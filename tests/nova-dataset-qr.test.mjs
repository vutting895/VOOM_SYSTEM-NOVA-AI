import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("dataset write path accepts decimal strings and rejects JS numeric prices", async () => {
  const route = await read("frontend/app/api/datasets/route.js");
  assert.match(route, /typeof value !== "string"/);
  assert.match(route, /_must_be_exact_decimal_string/);
  assert.match(route, /BigInt\(/);
  assert.match(route, /JSON\.stringify\(candle\)/);
  assert.match(route, /numeric_encoding: "decimal-string"/);
});

test("dataset object is compressed, content-addressed and owner-scoped", async () => {
  const route = await read("frontend/app/api/datasets/route.js");
  const migration = await read("supabase/migrations/202611020001_nova_market_dataset_registry.sql");
  assert.match(route, /gzipSync/);
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /auth\.user\.id \+ "\/"/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /'nova-datasets', 'nova-datasets', false/);
  assert.match(migration, /storage\.foldername\(name\)/);
});

test("dataset resolver verifies owner visibility, revocation and exact compressed hash", async () => {
  const route = await read("frontend/app/api/datasets/[id]/route.js");
  assert.match(route, /authenticateAgentRequest/);
  assert.match(route, /manifest\.revoked_at/);
  assert.match(route, /startsWith\(auth\.user\.id/);
  assert.match(route, /gunzipSync/);
  assert.match(route, /digest !== manifest\.content_sha256/);
  assert.match(route, /dataset_not_found/);
});

test("MT5 Hub and market data API preserve quoted prices as decimal strings", async () => {
  const hub = await read("integrations/system-hub/worker.js");
  const route = await read("frontend/app/api/market-data/route.js");
  assert.match(hub, /safePriceDecimal/);
  assert.match(hub, /value\.toFixed\(digits\)/);
  assert.match(route, /typeof value !== 'string'/);
  assert.match(route, /open: bar\.open/);
  assert.doesNotMatch(route, /open: Number\(bar\.open\)/);
});
