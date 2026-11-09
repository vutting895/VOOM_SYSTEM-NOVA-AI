import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const RELAY_ORIGIN = "https://voom-mt5-bridge-relay.suwapat787.workers.dev";
const UI_ORIGIN = "https://voomsystem.netlify.app";
const FALLBACK_UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
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

test("bad or expired Supabase session returns 401 with an explicit fetch policy", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal);
    calls += 1;
    return Response.json({ message: "invalid session" }, { status: 401 });
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), envWithRoutes());
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid_or_expired_session");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("same-origin Supabase Auth redirect is followed without leaving the trusted origin", async () => {
  const originalFetch = globalThis.fetch;
  const seenOrigins = [];
  let authCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    seenOrigins.push(url.origin);
    assert.equal(init.redirect, "manual");
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      authCalls += 1;
      if (authCalls === 1) {
        return new Response(null, { status: 302, headers: { Location: "/auth/v1/user" } });
      }
      return Response.json({ message: "invalid session" }, { status: 401 });
    }
    throw new Error("Unexpected outbound request to " + url.origin + url.pathname);
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), envWithRoutes());
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid_or_expired_session");
    assert.equal(authCalls, 2);
    assert.deepEqual(seenOrigins, ["https://supabase.test", "https://supabase.test"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("external Supabase Auth redirect is not followed and fails closed", async () => {
  const originalFetch = globalThis.fetch;
  const seenOrigins = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    seenOrigins.push(url.origin);
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://attacker.example/collect" } });
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), envWithRoutes());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "auth_service_unavailable");
    assert.deepEqual(seenOrigins, ["https://supabase.test"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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


test("foreign user's connection ID is not forwarded to the Bridge", async () => {
  const originalFetch = globalThis.fetch;
  let relayCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "different-test-user-id" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      // Both predicates must be present: a valid row ID alone is not enough.
      assert.equal(url.searchParams.get("id"), "eq." + CONNECTION_ID);
      assert.equal(url.searchParams.get("user_id"), "eq.different-test-user-id");
      // Simulate the owner-scoped Supabase response when this ID belongs to another user.
      return Response.json([]);
    }
    if (url.origin === RELAY_ORIGIN) {
      relayCalls += 1;
      throw new Error("Foreign connection ID must never reach the Bridge Relay");
    }
    throw new Error("Unexpected outbound request to " + url.origin + url.pathname);
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), envWithRoutes());
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "connection_not_found");
    assert.equal(relayCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare rollback UI remains CORS-allowed while Netlify is primary", async () => {
  const response = await worker.fetch(new Request(
    "https://proxy.test/api/account?connection_id=" + CONNECTION_ID,
    { headers: { Origin: FALLBACK_UI_ORIGIN } }
  ), envWithRoutes());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), FALLBACK_UI_ORIGIN);
});


test("history request forwards the bounded UTC range through the owner-scoped proxy", async () => {
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
      return Response.json({ symbol: "XAUUSDm", timeframe: "H1", bars: [], mode: "read-only" });
    }
    throw new Error("Unexpected outbound request to " + url.origin + url.pathname);
  };

  try {
    const query = "connection_id=" + CONNECTION_ID
      + "&symbol=XAUUSDm&timeframe=H1"
      + "&start_utc=2026-01-01T00:00:00Z&end_utc=2026-01-15T00:00:00Z";
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/history?" + query,
      { headers: { Authorization: "Bearer " + USER_TOKEN, Origin: UI_ORIGIN } }
    ), envWithRoutes());
    assert.equal(response.status, 200);
    assert.equal(new URL(relayRequest.url).pathname, "/api/history");
    assert.equal(new URL(relayRequest.url).searchParams.get("symbol"), "XAUUSDm");
    assert.equal(new URL(relayRequest.url).searchParams.get("timeframe"), "H1");
    assert.equal(new URL(relayRequest.url).searchParams.get("start_utc"), "2026-01-01T00:00:00Z");
    assert.equal(new URL(relayRequest.url).searchParams.get("end_utc"), "2026-01-15T00:00:00Z");
    assert.equal(new URL(relayRequest.url).searchParams.has("connection_id"), false);
    assert.equal(relayRequest.headers.get("Authorization"), "Bearer " + BRIDGE_TOKEN);
    assert.equal(relayRequest.headers.get("X-VOOM-TENANT-ID"), TENANT_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("history request for a foreign user's connection never reaches the relay", async () => {
  const originalFetch = globalThis.fetch;
  let relayCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "different-test-user-id" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("id"), "eq." + CONNECTION_ID);
      assert.equal(url.searchParams.get("user_id"), "eq.different-test-user-id");
      return Response.json([]);
    }
    if (url.origin === RELAY_ORIGIN) {
      relayCalls += 1;
      throw new Error("Foreign connection must not reach the relay");
    }
    throw new Error("Unexpected outbound request to " + url.origin + url.pathname);
  };

  try {
    const response = await worker.fetch(new Request(
      "https://proxy.test/api/history?connection_id=" + CONNECTION_ID
        + "&symbol=XAUUSDm&timeframe=H1"
        + "&start_utc=2026-01-01T00:00:00Z&end_utc=2026-01-02T00:00:00Z",
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), envWithRoutes());
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "connection_not_found");
    assert.equal(relayCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("proxy rejects duplicate query parameters before authentication or forwarding", async () => {
  const response = await worker.fetch(new Request(
    "https://proxy.test/api/history?connection_id=" + CONNECTION_ID
      + "&symbol=XAUUSDm&timeframe=H1"
      + "&start_utc=2026-01-01T00:00:00Z&start_utc=2026-01-02T00:00:00Z"
      + "&end_utc=2026-01-03T00:00:00Z"
  ), envWithRoutes());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "duplicate_query_parameter");
});

test("proxy rejects unknown query parameters instead of silently dropping them", async () => {
  const response = await worker.fetch(new Request(
    "https://proxy.test/api/account?connection_id=" + CONNECTION_ID + "&admin=true"
  ), envWithRoutes());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "query_parameter_not_allowed");
});

test("public health rejects ignored query parameters", async () => {
  const response = await worker.fetch(new Request("https://proxy.test/health?debug=true"), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "query_parameter_not_allowed");
});
