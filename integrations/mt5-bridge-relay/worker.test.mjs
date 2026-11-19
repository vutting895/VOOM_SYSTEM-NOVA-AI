import test from "node:test";
import assert from "node:assert/strict";
import worker, { authorizeBridge, constantTimeEqual, validateReadRequest } from "./worker.js";

const TENANT_ID = "tenant_12345678";
const TOKEN = "read_only_test_token_which_is_long_enough_123456";
const RELAY_ROUTES = JSON.stringify({
  [TENANT_ID]: {
    tenantId: TENANT_ID,
    token: TOKEN,
    url: "https://stale-origin.invalid"
  }
});

function makeEnv(stubFetch = async () => Response.json({ status: "ok" }), overrides = {}) {
  return {
    MT5_TENANT_ROUTES: RELAY_ROUTES,
    BRIDGE_SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => stubFetch(request, id)
      })
    },
    ...overrides
  };
}

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.token !== undefined) headers.set("Authorization", "Bearer " + options.token);
  if (options.tenant !== undefined) headers.set("X-VOOM-TENANT-ID", options.tenant);
  return new Request("https://voom-mt5-bridge-relay.suwapat787.workers.dev" + path, {
    method: options.method || "GET",
    headers
  });
}

test("health is public and explicitly read-only", async () => {
  const response = await worker.fetch(request("/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "relay_ready");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.order_submission_enabled, false);
});

test("account route rejects missing credentials", async () => {
  const response = await worker.fetch(request("/api/account"), makeEnv());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("tenant route mismatch fails closed", async () => {
  const response = await worker.fetch(request("/api/account", {
    token: TOKEN,
    tenant: "tenant_other_123"
  }), makeEnv());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "tenant_route_not_provisioned");
});

test("valid tenant request is sent only to its named Durable Object", async () => {
  let observed;
  const env = makeEnv(async (req, id) => {
    observed = { url: new URL(req.url), id, headers: req.headers };
    return Response.json({ connected: true, mode: "read-only", order_submission_enabled: false });
  });
  const response = await worker.fetch(request("/api/quotes?symbol=XAUUSDm&timeframe=M5&count=20", {
    token: TOKEN,
    tenant: TENANT_ID
  }), env);
  assert.equal(response.status, 200);
  assert.equal(observed.id, TENANT_ID);
  assert.equal(observed.url.origin, "https://bridge-session.internal");
  assert.equal(observed.url.pathname, "/api/quotes");
  assert.equal(observed.url.searchParams.get("symbol"), "XAUUSDm");
  assert.equal(observed.headers.get("X-Relay-Internal"), "1");
  assert.equal(observed.headers.get("X-VOOM-TENANT-ID"), TENANT_ID);
  assert.equal(observed.headers.get("Authorization"), null);
});

test("legacy per-route origin is ignored; relay uses only the tenant session", async () => {
  let observedOrigin;
  const env = makeEnv(async (req) => {
    observedOrigin = new URL(req.url).origin;
    return Response.json({ status: "ok" });
  });
  const response = await worker.fetch(request("/api/account", {
    token: TOKEN,
    tenant: TENANT_ID
  }), env);
  assert.equal(response.status, 200);
  assert.equal(observedOrigin, "https://bridge-session.internal");
  assert.notEqual(observedOrigin, "https://stale-origin.invalid");
});

test("route map configuration fails closed", async () => {
  const response = await worker.fetch(request("/api/account", {
    token: TOKEN,
    tenant: TENANT_ID
  }), makeEnv(undefined, { MT5_TENANT_ROUTES: "" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "tenant_route_map_not_configured");
});

test("order-like routes are denied and not proxied", async () => {
  const response = await worker.fetch(request("/api/orders", {
    method: "POST",
    token: TOKEN,
    tenant: TENANT_ID
  }), makeEnv());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).ordersEnabled, false);
});

test("query validation only allows bounded read parameters", () => {
  assert.deepEqual(validateReadRequest(new URL("https://relay.test/api/symbols?q=XAU&limit=100")), { ok: true });
  assert.deepEqual(validateReadRequest(new URL("https://relay.test/api/quotes?symbol=XAUUSDm&timeframe=M5&count=50")), { ok: true });
  assert.equal(validateReadRequest(new URL("https://relay.test/api/account?connection_id=abc")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/quotes?symbol=XAUUSDm&count=9999")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/quotes?symbol=XAUUSDm&symbol=OTHER")).ok, false);
});

test("portfolio is an authenticated read-only route with no query parameters", () => {
  assert.deepEqual(validateReadRequest(new URL("https://relay.test/api/portfolio")), { ok: true });
  assert.equal(validateReadRequest(new URL("https://relay.test/api/portfolio?symbol=XAUUSDm")).ok, false);
});

test("history accepts bounded 90-day ranges and rejects oversized or malformed ranges", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.deepEqual(validateReadRequest(new URL("https://relay.test/api/history?from_ts=" + (now - 3600) + "&to_ts=" + now + "&limit=100")), { ok: true });
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?from_ts=" + (now - 91 * 86400) + "&to_ts=" + now + "&limit=100")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?from_ts=1&to_ts=2&limit=501")).ok, false);
});

test("token comparison rejects missing, unequal, and non-string values", () => {
  assert.equal(constantTimeEqual(TOKEN, TOKEN), true);
  assert.equal(constantTimeEqual(TOKEN, TOKEN + "x"), false);
  assert.equal(constantTimeEqual(TOKEN, undefined), false);
});

test("a wrong bearer token cannot attach to a tenant session", () => {
  const fakeRequest = {
    headers: new Headers({
      Authorization: "Bearer wrong_token_which_is_long_enough_123456",
      "X-VOOM-TENANT-ID": TENANT_ID
    })
  };
  const result = authorizeBridge(fakeRequest, { MT5_TENANT_ROUTES: RELAY_ROUTES });
  assert.deepEqual(result, { ok: false, status: 401, error: "invalid_bridge_token" });
});
