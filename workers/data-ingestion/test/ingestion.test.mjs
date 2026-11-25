import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/index.js";

globalThis.crypto ??= webcrypto;

function makeEvent(overrides = {}) {
  return {
    schema_version: "1.0",
    event_id: "a18c2a31-25c7-4b11-8a22-a1c2a3d4e5f6",
    event_type: "market_snapshot",
    occurred_at: "2025-01-01T00:00:00Z",
    source: {
      component: "mt5_ea",
      ea_version: "1.83",
      source_sha256: "a".repeat(64),
      repo_commit: "b".repeat(40),
      symbol: "XAUUSDm",
      timeframe: "M5"
    },
    scope: { account_scope_hmac: "c".repeat(64), magic_scope: 0 },
    market: { bid: 2000, ask: 2000.2, spread_points: 20, atr: 2.1, bar_closed: true, data_quality: "PASS" },
    ...overrides
  };
}

function makeEnv() {
  const rows = new Map();
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          const [tenant, eventId, schema, type, occurred, payload, digest, received] = args;
          const key = tenant + ":" + eventId;
          if (rows.has(key)) return { meta: { changes: 0 } };
          rows.set(key, { tenant_id: tenant, event_id: eventId, schema_version: schema, event_type: type,
            occurred_at: occurred, payload_json: payload, payload_sha256: digest, received_at: received });
          return { meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes("SELECT payload_sha256")) {
            const row = rows.get(args[0] + ":" + args[1]);
            return row ? { payload_sha256: row.payload_sha256, received_at: row.received_at } : null;
          }
          return rows.get(args[0] + ":" + args[1]) || null;
        }
      };
    }
  };
  return { DB, SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test-key", rows };
}

async function call(path, { method = "GET", token, body, env } = {}) {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    if (token === "bad") return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ id: token === "tenant-b" ? "user-b" : "user-a" }), { status: 200 });
  };
  return worker.fetch(new Request("https://ingest.test" + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  }), env);
}

test("unauthenticated ingest is rejected", async () => {
  const env = makeEnv();
  const res = await call("/v1/events", { method: "POST", body: makeEvent(), env });
  assert.equal(res.status, 401);
});

test("first ingest returns durable digest receipt and replay is idempotent", async () => {
  const env = makeEnv();
  const event = makeEvent();
  const first = await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.receipt.event_id, event.event_id);
  assert.match(firstBody.receipt.payload_sha256, /^[a-f0-9]{64}$/);
  const replay = await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, "DUPLICATE_CONFIRMED");
});

test("same event ID with changed payload conflicts", async () => {
  const env = makeEnv();
  const event = makeEvent();
  await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  const changed = makeEvent({ market: { bid: 2001, ask: 2001.2, spread_points: 20, atr: 2.1, bar_closed: true, data_quality: "PASS" } });
  const res = await call("/v1/events", { method: "POST", token: "tenant-a", body: changed, env });
  assert.equal(res.status, 409);
});

test("tenant A cannot read tenant B data", async () => {
  const env = makeEnv();
  const event = makeEvent();
  await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  const res = await call("/v1/events/" + event.event_id, { token: "tenant-b", env });
  assert.equal(res.status, 404);
});

test("forbidden account identifiers are rejected", async () => {
  const env = makeEnv();
  const event = makeEvent({ debug: { account_login: "123456" } });
  const res = await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  assert.equal(res.status, 422);
});

test("execution audit with any broker transport call is rejected", async () => {
  const env = makeEnv();
  const event = makeEvent({
    event_type: "execution_audit",
    execution_audit: { mode: "READ_ONLY", broker_request_attempted: false, broker_transport_calls: 1 }
  });
  delete event.market;
  const res = await call("/v1/events", { method: "POST", token: "tenant-a", body: event, env });
  assert.equal(res.status, 422);
});

test("unknown trading route is not exposed", async () => {
  const env = makeEnv();
  const res = await call("/api/orders", { token: "tenant-a", env });
  assert.equal(res.status, 404);
});
