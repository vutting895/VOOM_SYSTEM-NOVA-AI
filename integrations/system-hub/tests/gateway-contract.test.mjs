import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const TOKEN = "test-access-token";
const USER_A = "user-a";
const USER_B = "user-b";
const CONNECTION_A = "00000000-0000-4000-8000-00000000000a";
const CONNECTION_B = "00000000-0000-4000-8000-00000000000b";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function makeRequest(path, { method = "GET", user = USER_A, body, headers = {} } = {}) {
  const requestHeaders = {
    Authorization: "Bearer " + TOKEN,
    "X-NOVA-Contract-Version": "1",
    "X-NOVA-Request-ID": "00000000-0000-4000-8000-000000000001",
    Accept: "application/json",
    ...headers
  };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  return new Request("https://hub.test" + path, {
    method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function mockSupabase({ user = USER_A, rows = [] } = {}) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      return Response.json({ id: user });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("user_id"), "eq." + user);
      return Response.json(rows.filter((row) => row.user_id === user));
    }
    throw new Error("Unexpected request: " + url.origin + url.pathname);
  };
}

test("capability registry requires authentication and returns a versioned envelope", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/capabilities"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.contractVersion, "1");
  assert.equal(body.requestId, "00000000-0000-4000-8000-000000000001");
  assert.ok(body.data.capabilities.length >= 5);
  assert.ok(body.data.capabilities.every((capability) => capability.readOnly === true));
  assert.ok(body.data.capabilities.every((capability) => typeof capability.handler === "string"));
});

test("gateway rejects a missing or unsupported contract version before auth", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("should not call auth"); };
  const response = await worker.fetch(makeRequest("/v1/gateway/capabilities", {
    headers: { "X-NOVA-Contract-Version": "99" }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "contract_version_unsupported");
  assert.equal(called, false);
});

test("gateway rejects malformed request IDs", async () => {
  globalThis.fetch = async () => { throw new Error("should not call auth"); };
  const response = await worker.fetch(makeRequest("/v1/gateway/capabilities", {
    headers: { "X-NOVA-Request-ID": "not-a-uuid" }
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request_id");
});

test("unknown tool names fail closed", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/not_registered", {
    method: "POST", body: {}
  }), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "capability_not_found");
});

test("tool input rejects unknown fields and malformed schema", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/list_connections", {
    method: "POST", body: { tenant_id: USER_A }
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request");
});

test("connection inventory is scoped to the authenticated user", async () => {
  mockSupabase({ user: USER_B, rows: [
    { id: CONNECTION_A, user_id: USER_A, provider: "exness_mt5", environment: "demo", status: "connected" },
    { id: CONNECTION_B, user_id: USER_B, provider: "exness_mt5", environment: "demo", status: "pending" }
  ] });
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/list_connections", {
    method: "POST", user: USER_B, body: {}
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.count, 1);
  assert.equal(body.data.connections[0].connectionId, CONNECTION_B);
  assert.equal(JSON.stringify(body).includes(USER_A), false);
});

test("a user cannot inspect another tenant's connection", async () => {
  mockSupabase({ user: USER_B, rows: [
    { id: CONNECTION_A, user_id: USER_A, provider: "exness_mt5", environment: "demo", status: "connected" }
  ] });
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/mt5_connection_status", {
    method: "POST", user: USER_B, body: { connection_id: CONNECTION_A }
  }), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "resource_not_found");
});

test("MT5 quote capability enforces symbol, timeframe and count bounds", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/mt5_quotes", {
    method: "POST", body: {
      connection_id: CONNECTION_A, symbol: "XAUUSDm", timeframe: "H1", count: 501
    }
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request");
});

test("no write or trading capability is registered", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/capabilities"), env);
  const body = await response.json();
  const names = body.data.capabilities.map((item) => item.name);
  assert.equal(names.some((name) => /order|execute|withdraw|transfer|close_position/i.test(name)), false);
  assert.equal(body.data.capabilities.every((item) => item.readOnly), true);
});

test("gateway errors never echo bearer tokens", async () => {
  mockSupabase();
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/not_registered", {
    method: "POST", body: {}
  }), env);
  const body = await response.text();
  assert.equal(body.includes(TOKEN), false);
});

test("MT5 account capability routes through the Hub service binding with the user session", async () => {
  mockSupabase({ rows: [{
    id: CONNECTION_A, user_id: USER_A, provider: "exness_mt5", environment: "demo",
    status: "connected", bridge_route_id: "route-a"
  }] });
  let bindingCalled = false;
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/mt5_account_summary", {
    method: "POST", body: { connection_id: CONNECTION_A }
  }), {
    ...env,
    MT5_READONLY_PROXY: {
      async fetch(request) {
        bindingCalled = true;
        const url = new URL(request.url);
        assert.equal(url.pathname, "/api/account");
        assert.equal(url.searchParams.get("connection_id"), CONNECTION_A);
        assert.equal(request.headers.get("Authorization"), "Bearer " + TOKEN);
        return Response.json({ connected: true, server: "Demo", currency: "USD", balance: 100, equity: 100 });
      }
    }
  });
  const body = await response.json();
  assert.equal(bindingCalled, true);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.account.mode, "read-only");
  assert.equal(body.data.ordersEnabled, false);
});

test("NOVA AI capability uses only the configured service binding", async () => {
  mockSupabase();
  let bindingCalled = false;
  const response = await worker.fetch(makeRequest("/v1/gateway/tools/nova_ai_chat", {
    method: "POST", body: { messages: [{ role: "user", content: "Explain a test signal." }] }
  }), {
    ...env,
    NOVA_AI: {
      async fetch(request) {
        bindingCalled = true;
        assert.equal(new URL(request.url).pathname, "/api/chat");
        assert.equal(request.headers.get("Authorization"), "Bearer " + TOKEN);
        return Response.json({ message: "Research only.", provider: "test-adapter" });
      }
    }
  });
  const body = await response.json();
  assert.equal(bindingCalled, true);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.message, "Research only.");
  assert.equal(body.data.liveTradingEnabled, false);
});
