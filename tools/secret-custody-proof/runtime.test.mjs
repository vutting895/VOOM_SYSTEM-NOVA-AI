import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCustodyRuntime } from "./runtime.mjs";

const request = {
  connection_id: "00000000-0000-4000-8000-000000000101",
  capability: "account.summary.read",
  parameters: {},
  policy_version: "read-only-v1"
};

async function fixture(t, overrides = {}) {
  const ledgerDir = await mkdtemp(join(tmpdir(), "nova-custody-proof-"));
  t.after(() => rm(ledgerDir, { recursive: true, force: true }));
  const calls = [];
  const connections = new Map([
    ["user-a", { ownerId: "user-a", connectionId: request.connection_id, provider: "exness_mt5", environment: "demo" }],
    ["user-b", { ownerId: "user-b", connectionId: "00000000-0000-4000-8000-000000000102", provider: "exness_mt5", environment: "demo" }]
  ]);
  const bindings = new Map([
    ["user-a", { bindingId: "binding-a", principalId: "user-a", connectionId: request.connection_id, provider: "exness_mt5", environment: "demo", state: "ACTIVE", capabilities: ["account.summary.read"] }],
    ["user-b", { bindingId: "binding-b", principalId: "user-b", connectionId: "00000000-0000-4000-8000-000000000102", provider: "exness_mt5", environment: "demo", state: "ACTIVE", capabilities: ["account.summary.read"] }]
  ]);
  const deps = {
    verifySession: async token => {
      if (token === "valid-user-a") return { subject: "user-a" };
      if (token === "valid-user-b") return { subject: "user-b" };
      throw new Error("invalid token");
    },
    resolveConnection: async (subject, connectionId) => {
      const row = connections.get(subject);
      return row?.connectionId === connectionId ? row : null;
    },
    resolveBinding: async ({ principalId }) => bindings.get(principalId),
    provider: {
      executeReadOnly: async input => {
        calls.push(input);
        return { account: { balance: 1000, equity: 1000, currency: "USD" } };
      }
    },
    ledgerDir,
    ...overrides
  };
  return { runtime: createCustodyRuntime(deps), calls, ledgerDir, deps };
}

const invoke = (runtime, body = request, token = "valid-user-a", key = "idempotency-0001") =>
  runtime.handle({ authorization: "Bearer " + token, idempotencyKey: key, body });

test("local runtime resolves owner from verified session and calls only the matching read-only binding", async t => {
  const { runtime, calls } = await fixture(t);
  const result = await invoke(runtime);
  assert.equal(result.status, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.body.state, "SUCCEEDED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].binding.principalId, "user-a");
  assert.equal(calls[0].capability, "account.summary.read");
  assert.equal("owner_id" in calls[0], false);
});

test("cross-owner connection substitution fails before provider invocation", async t => {
  const { runtime, calls } = await fixture(t);
  const result = await invoke(runtime, {
    ...request, connection_id: "00000000-0000-4000-8000-000000000102"
  }, "valid-user-a");
  assert.equal(result.status, 404);
  assert.equal(calls.length, 0);
});

test("caller-supplied identity, secret fields and write capabilities fail closed", async t => {
  const { runtime, calls } = await fixture(t);
  for (const body of [
    { ...request, owner_id: "user-b" },
    { ...request, parameters: { access_token: "synthetic" } },
    { ...request, parameters: { arbitrary_sql: "select * from secrets" } },
    { ...request, capability: "trade.submit" }
  ]) {
    assert.equal((await invoke(runtime, body)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("same idempotency key replays sanitized result after runtime restart without second provider call", async t => {
  const { runtime, calls, deps } = await fixture(t);
  const first = await invoke(runtime);
  const restarted = createCustodyRuntime(deps);
  const replay = await invoke(restarted);
  assert.equal(first.body.operation_id, replay.body.operation_id);
  assert.deepEqual(replay.body.result, first.body.result);
  assert.equal(calls.length, 1);
  const files = await import("node:fs/promises");
  const entries = await files.readdir(deps.ledgerDir);
  const persisted = JSON.parse(await readFile(join(deps.ledgerDir, entries[0]), "utf8"));
  assert.equal(persisted.state, "SUCCEEDED");
  assert.equal(JSON.stringify(persisted).includes("SYNTHETIC-CREDENTIAL"), false);
});

test("same idempotency key with a changed request fingerprint returns conflict", async t => {
  const { runtime, calls } = await fixture(t);
  await invoke(runtime);
  const conflict = await invoke(runtime, { ...request, parameters: { symbols: ["XAUUSD"] } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.result_code, "IDEMPOTENCY_CONFLICT");
  assert.equal(calls.length, 1);
});

test("ambiguous provider outcome is durable and never blindly redispatched", async t => {
  const { runtime, calls, deps } = await fixture(t, {
    provider: { executeReadOnly: async () => {
      calls.push("sent");
      const error = new Error("synthetic timeout after send");
      error.outcomeUnknown = true;
      throw error;
    } }
  });
  const first = await invoke(runtime);
  const retry = await invoke(createCustodyRuntime(deps));
  assert.equal(first.status, 202);
  assert.equal(first.body.state, "OUTCOME_UNKNOWN");
  assert.equal(retry.status, 202);
  assert.equal(retry.body.reconciliation_required, true);
  assert.equal(calls.length, 1);
});

test("provider result with credential-shaped fields is rejected and never returned", async t => {
  const { runtime } = await fixture(t, {
    provider: { executeReadOnly: async () => ({ account: { balance: 100, access_token: "synthetic-secret" } }) }
  });
  const result = await invoke(runtime);
  assert.equal(result.status, 502);
  assert.equal(result.body.result, undefined);
});

test("invalid session is rejected before connection lookup", async t => {
  let lookups = 0;
  const { runtime, calls, deps } = await fixture(t);
  const guarded = createCustodyRuntime({
    ...deps,
    resolveConnection: async (...args) => { lookups++; return deps.resolveConnection(...args); }
  });
  const result = await invoke(guarded, request, "expired-or-invalid");
  assert.equal(result.status, 401);
  assert.equal(lookups, 0);
  assert.equal(calls.length, 0);
});

test("concurrent duplicate requests publish one complete claim and invoke provider once", async t => {
  let markStarted;
  let releaseProvider;
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { releaseProvider = resolve; });
  const { runtime, calls } = await fixture(t, {
    provider: { executeReadOnly: async input => {
      calls.push(input);
      markStarted();
      await gate;
      return { account: { balance: 1000, equity: 1000, currency: "USD" } };
    } }
  });
  const firstPromise = invoke(runtime);
  await started;
  const second = await invoke(runtime);
  assert.equal(second.status, 202);
  assert.equal(second.body.state, "RUNNING");
  releaseProvider();
  const first = await firstPromise;
  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
});


test("Supabase auth outage is retryable and distinct from an invalid session", async t => {
  let connectionLookups = 0;
  const { calls, deps } = await fixture(t, {
    verifySession: async () => { throw new Error("SUPABASE_UNAVAILABLE"); },
    resolveConnection: async () => {
      connectionLookups++;
      return null;
    }
  });
  const runtime = createCustodyRuntime(deps);
  const result = await invoke(runtime);
  assert.equal(result.status, 503);
  assert.equal(result.body.state, "FAILED_FINAL");
  assert.equal(result.body.result_code, "SUPABASE_UNAVAILABLE");
  assert.equal(connectionLookups, 0);
  assert.equal(calls.length, 0);
});


test("sanitizer accepts schema-valid rotation, quote timestamps, and position PnL", async t => {
  const { runtime } = await fixture(t, {
    provider: { executeReadOnly: async () => ({
      quotes: [{ symbol: "XAUUSD", bid: 2300.1, ask: 2300.2, timestamp: "2026-11-01T05:00:00.000Z" }],
      positions: [{ symbol: "XAUUSD", side: "long", volume: 0.1, unrealized_pnl: 12.5 }],
      rotation: { state: "ROTATION_REQUIRED", generation: 2 }
    }) }
  });
  const result = await invoke(runtime);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.rotation.state, "ROTATION_REQUIRED");
  assert.equal(result.body.result.quotes[0].timestamp, "2026-11-01T05:00:00.000Z");
  assert.equal(result.body.result.positions[0].unrealized_pnl, 12.5);
});

test("sanitizer rejects invalid timestamps, non-finite PnL, and overlong symbols", async t => {
  for (const resultValue of [
    { quotes: [{ symbol: "XAUUSD", bid: 1, ask: 2, timestamp: "not-a-date" }] },
    { positions: [{ symbol: "XAUUSD", side: "long", volume: 1, unrealized_pnl: Infinity }] },
    { quotes: [{ symbol: "X".repeat(33), bid: 1, ask: 2 }] },
    { positions: [{ symbol: "X".repeat(33), side: "short", volume: 1 }] },
    { rotation: { state: "UNKNOWN_STATE", generation: 1 } },
    { rotation: { state: "ROTATED", generation: 0 } }
  ]) {
    const { runtime } = await fixture(t, {
      provider: { executeReadOnly: async () => resultValue }
    });
    const response = await invoke(runtime);
    assert.equal(response.status, 502);
    assert.equal(response.body.result, undefined);
  }
});


test("request since and provider quote timestamps require calendar-valid RFC 3339 date-time with timezone", async t => {
  const invalid = [
    "2026-11-01",
    "2026-11-01T05:00:00",
    "2026-02-30T05:00:00Z",
    "2026-11-01T25:00:00Z",
    "2026-11-01T05:00:00+07:60"
  ];

  for (const since of invalid) {
    const { runtime, calls } = await fixture(t);
    const result = await invoke(runtime, { ...request, parameters: { since } });
    assert.equal(result.status, 400, `expected invalid since to be rejected: ${since}`);
    assert.equal(calls.length, 0);
  }

  for (const timestamp of invalid) {
    const { runtime } = await fixture(t, {
      provider: { executeReadOnly: async () => ({
        quotes: [{ symbol: "XAUUSD", bid: 2300.1, ask: 2300.2, timestamp }]
      }) }
    });
    const result = await invoke(runtime);
    assert.equal(result.status, 502, `expected invalid quote timestamp to be rejected: ${timestamp}`);
    assert.equal(result.body.result, undefined);
  }

  for (const valid of ["2026-11-01T05:00:00.000Z", "2026-11-01T12:00:00+07:00", "2026-11-01t05:00:00.000z"]) {
    const { runtime } = await fixture(t, {
      provider: { executeReadOnly: async () => ({
        quotes: [{ symbol: "XAUUSD", bid: 2300.1, ask: 2300.2, timestamp: valid }]
      }) }
    });
    const result = await invoke(runtime);
    assert.equal(result.status, 200);
    assert.equal(result.body.result.quotes[0].timestamp, valid);
  }

  const { runtime: validSince } = await fixture(t);
  assert.equal((await invoke(validSince, {
    ...request, parameters: { since: "2026-11-01t12:00:00+07:00" }
  })).status, 200);
});
