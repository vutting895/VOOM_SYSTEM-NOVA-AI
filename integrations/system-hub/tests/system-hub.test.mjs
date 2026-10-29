import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
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

function request(path, options = {}) {
  return new Request("https://hub.test" + path, options);
}
function mockAuthAndRest({ authStatus = 200, userId = "user-a", rows = [] } = {}) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      return Response.json(authStatus === 200 ? { id: userId } : { message: "redacted" }, { status: authStatus });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      assert.equal(url.searchParams.get("user_id"), "eq." + userId);
      return Response.json(rows);
    }
    throw new Error("Unexpected external request: " + url.origin + url.pathname);
  };
}

test("health endpoint is public, CORS-safe, and keeps trading disabled", async () => {
  const response = await worker.fetch(request("/health", { headers: { Origin: UI_ORIGIN } }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "voom-system-hub");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.authConfigured, true);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), UI_ORIGIN);
});

test("protected routes reject missing token", async () => {
  const response = await worker.fetch(request("/v1/integrations"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("missing auth runtime settings fails closed", async () => {
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_not_configured");
});

test("bad or expired Supabase session is rejected", async () => {
  mockAuthAndRest({ authStatus: 401 });
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
});

test("auth provider failure fails closed", async () => {
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_provider_unavailable");
});

test("integration registry requires a valid Supabase session", async () => {
  mockAuthAndRest();
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN, Origin: UI_ORIGIN }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "voom-system-hub");
  assert.equal(body.integrations.some((item) => item.id === "exness-mt5-demo"), true);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), UI_ORIGIN);
});

test("connections are filtered by the authenticated user and expose no credentials", async () => {
  mockAuthAndRest({ userId: "user-a", rows: [{
    id: CONNECTION_ID,
    user_id: "user-a",
    provider: "exness_mt5",
    environment: "demo",
    status: "connected",
    account_label: "Exness MT5 Demo",
    last_verified_at: null,
    created_at: "2026-10-29T00:00:00Z",
    bridge_route_id: "tenant-a",
    password: "must-not-leak",
    access_token: "must-not-leak"
  }] });
  const response = await worker.fetch(request("/v1/connections", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /"readiness":"configured"/);
  assert.doesNotMatch(text, /must-not-leak|password|access_token|bridge_route_id/);
  assert.match(text, /"dataVerified":false/);
});

test("another user's connection is not found instead of leaking existence", async () => {
  mockAuthAndRest({ userId: "user-a", rows: [] });
  const response = await worker.fetch(request("/v1/connections/" + CONNECTION_ID + "/status", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "connection_not_found");
});

test("malformed connection IDs are rejected", async () => {
  mockAuthAndRest();
  const response = await worker.fetch(request("/v1/connections/not-a-uuid/status", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "valid_connection_id_required");
});

test("live read-only check drops account payload and reports verified only after success", async () => {
  mockAuthAndRest({ rows: [{
    id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
    status: "connected", account_label: "Exness MT5 Demo", bridge_route_id: "tenant-a"
  }] });
  const proxyUrl = "https://voom-mt5-readonly-proxy.suwapat787.workers.dev";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      return Response.json([{
        id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
        status: "connected", account_label: "Exness MT5 Demo", bridge_route_id: "tenant-a"
      }]);
    }
    if (url.origin === proxyUrl && url.pathname === "/api/account") {
      assert.equal(url.searchParams.get("connection_id"), CONNECTION_ID);
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      return Response.json({ balance: "999999", account_number: "private" });
    }
    throw new Error("Unexpected external request: " + url.origin + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/v1/connections/" + CONNECTION_ID + "/check", {
      method: "POST", headers: { Authorization: "Bearer " + USER_TOKEN }
    }), env);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /"state":"data_verified"/);
    assert.match(body, /"dataVerified":true/);
    assert.doesNotMatch(body, /999999|account_number|private/);
    assert.match(body, /"ordersEnabled":false/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("pending connection does not call the proxy", async () => {
  mockAuthAndRest({ rows: [{
    id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
    status: "pending", bridge_route_id: null
  }] });
  const response = await worker.fetch(request("/v1/connections/" + CONNECTION_ID + "/check", {
    method: "POST", headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).state, "pending_provisioning");
});

test("untrusted browser origin and order route are rejected", async () => {
  const originResponse = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN, Origin: "https://attacker.example" }
  }), env);
  assert.equal(originResponse.status, 403);
  const orderResponse = await worker.fetch(request("/api/orders", {
    method: "POST", headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(orderResponse.status, 404);
});
