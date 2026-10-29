import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const RELAY_ORIGIN = "https://voom-mt5-bridge-relay.suwapat787.workers.dev";
const UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const USER_TOKEN = "supabase_test_access_token";
const BRIDGE_TOKEN = "bridge_test_token_long_enough_for_route_validation_123";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000000";
const TENANT_ID = "tenant_12345678";

function envWithRoutes() {
  return {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "public-test-key",
    MT5_TENANT_ROUTES: JSON.stringify({
      [TENANT_ID]: {
        tenantId: TENANT_ID,
        token: BRIDGE_TOKEN,
        url: "https://stale-origin.invalid"
      }
    })
  };
}

test("proxy health is public and read-only", async () => {
  const response = await worker.fetch(new Request("https://proxy.test/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("private MT5 endpoint rejects missing user session", async () => {
  const response = await worker.fetch(new Request("https://proxy.test/api/account?connection_id=" + CONNECTION_ID), envWithRoutes());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("connected user is routed only to the stable workers.dev relay", async () => {
  const originalFetch = globalThis.fetch;
  let relayRequest;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "user-test-id" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-test-id");
      return Response.json([{
        id: CONNECTION_ID,
        user_id: "user-test-id",
        provider: "exness_mt5",
        environment: "demo",
        status: "connected",
        bridge_route_id: TENANT_ID
      }]);
    }
    if (url.origin === RELAY_ORIGIN) {
      relayRequest = { url, headers: new Headers(init.headers || {}) };
      return Response.json({ status: "ok", mode: "read-only", order_submission_enabled: false });
    }
    throw new Error("Unexpected outbound request to " + url.origin + url.pathname);
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
      { headers: { Authorization: "Bearer " + USER_TOKEN, Origin: UI_ORIGIN } }
    ), envWithRoutes());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), UI_ORIGIN);
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(new URL(relayRequest.url).origin, RELAY_ORIGIN);
    assert.equal(new URL(relayRequest.url).pathname, "/api/account");
    assert.equal(new URL(relayRequest.url).searchParams.has("connection_id"), false);
    assert.equal(relayRequest.headers.get("Authorization"), "Bearer " + BRIDGE_TOKEN);
    assert.equal(relayRequest.headers.get("X-VOOM-TENANT-ID"), TENANT_ID);
    assert.notEqual(new URL(relayRequest.url).origin, "https://stale-origin.invalid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
