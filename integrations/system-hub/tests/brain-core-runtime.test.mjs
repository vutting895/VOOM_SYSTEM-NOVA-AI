import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const UI_ORIGIN = "https://voomsystem.netlify.app";
const USER_TOKEN = "test-user-access-token";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000000";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: UI_ORIGIN,
  MT5_READONLY_PROXY_URL: "https://voom-mt5-readonly-proxy.suwapat787.workers.dev"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, body, token = USER_TOKEN) {
  return new Request("https://hub.test" + path, {
    method: "POST",
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), Origin: UI_ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
function intent(capability, parameters = {}) {
  return {
    schema_version: "1.0",
    intent_id: "11111111-1111-4111-8111-111111111111",
    capability,
    connection_id: CONNECTION_ID,
    parameters
  };
}
function mockBase({ rows = [], proxyAccount = { connected: true, server: "Exness-MT5Trial9", currency: "USD", balance: 1000, equity: 1000 } } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    calls.push({ url, init });
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      return Response.json(rows);
    }
    if (url.origin === "https://voom-mt5-readonly-proxy.suwapat787.workers.dev" && url.pathname === "/api/account") {
      assert.equal(init.method || "GET", "GET");
      return Response.json(proxyAccount);
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  return calls;
}

const OWN_CONNECTION = {
  id: CONNECTION_ID,
  user_id: "user-a",
  provider: "exness_mt5",
  environment: "demo",
  status: "connected",
  bridge_route_id: "route-user-a"
};

test("Brain intent route requires a verified Supabase session", async () => {
  const response = await worker.fetch(request("/v1/brain/intents", intent("mt5.account.read"), ""), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("Brain intent rejects client-supplied permission flags", async () => {
  mockBase();
  const response = await worker.fetch(request("/v1/brain/intents", { ...intent("mt5.account.read"), ordersEnabled: true }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_intent_schema");
});

test("Brain intent blocks order submission before connection lookup or broker dispatch", async () => {
  const calls = mockBase();
  const response = await worker.fetch(request("/v1/brain/intents", intent("broker.order.submit")), env);
  const body = await response.json();
  assert.equal(response.status, 423);
  assert.equal(body.error, "execution_disabled");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(calls.filter((call) => call.url.pathname === "/rest/v1/broker_connections").length, 0);
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/api/")).length, 0);
});

test("Brain Core routes an owned Demo account read through the existing read-only handler", async () => {
  mockBase({ rows: [OWN_CONNECTION] });
  const response = await worker.fetch(request("/v1/brain/intents", intent("mt5.account.read")), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.account.environment, "demo");
  assert.equal(body.account.mode, "read-only");
  assert.equal(body.account.order_submission_enabled, false);
  assert.equal(body.executionEnabled, false);
});

test("Brain Core does not reveal a foreign tenant connection", async () => {
  mockBase({ rows: [] });
  const response = await worker.fetch(request("/v1/brain/intents", intent("mt5.account.read")), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "connection_not_found");
});
