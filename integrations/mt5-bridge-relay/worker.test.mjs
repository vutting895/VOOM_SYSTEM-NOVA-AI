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
  assert.deepEqual(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00Z&end_utc=2026-01-15T00:00:00Z")), { ok: true });
  // Broker-session H4/D1 bar opens can be offset from UTC epoch boundaries.
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=H4&start_utc=2026-01-01T02:00:00Z&end_utc=2026-01-02T02:00:00Z")).ok, true);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=D1&start_utc=2026-01-01T22:00:00Z&end_utc=2026-01-05T22:00:00Z")).ok, true);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-15T00:00:00Z&end_utc=2026-01-01T00:00:00Z")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00Z&end_utc=2026-02-01T00:00:00Z")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-02-30T00:00:00Z&end_utc=2026-03-01T00:00:00Z")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/account?connection_id=abc")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/quotes?symbol=XAUUSDm&count=9999")).ok, false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/quotes?symbol=XAUUSDm&symbol=OTHER")).ok, false);
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


test("history request is forwarded only through the authenticated tenant session", async () => {
  let observed;
  const env = makeEnv(async (req, id) => {
    observed = {url:new URL(req.url), id, method:req.method, headers:req.headers};
    return Response.json({symbol:"XAUUSDm",timeframe:"M15",bars:[],mode:"read-only",ordersEnabled:false});
  });
  const query = "symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00Z&end_utc=2026-01-15T00:00:00Z";
  const response = await worker.fetch(request("/api/history?" + query,{token:TOKEN,tenant:TENANT_ID}),env);
  assert.equal(response.status,200);
  assert.equal(observed.id,TENANT_ID);
  assert.equal(observed.method,"GET");
  assert.equal(observed.url.pathname,"/api/history");
  assert.equal(observed.url.search,"?"+query);
  assert.equal(observed.headers.get("X-Relay-Internal"),"1");
  assert.equal(observed.headers.get("X-VOOM-TENANT-ID"),TENANT_ID);
  assert.equal(observed.headers.get("Authorization"),null);
});

test("history route rejects duplicate, reversed, oversized and non-UTC ranges", () => {
  const base = "symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00Z&end_utc=2026-01-15T00:00:00Z";
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?"+base+"&symbol=EURUSD")).ok,false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-15T00:00:00Z&end_utc=2026-01-01T00:00:00Z")).ok,false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00Z&end_utc=2026-02-01T00:00:00Z")).ok,false);
  assert.equal(validateReadRequest(new URL("https://relay.test/api/history?symbol=XAUUSDm&timeframe=M15&start_utc=2026-01-01T00:00:00%2B07:00&end_utc=2026-01-02T00:00:00Z")).ok,false);
});

test("status endpoint is authenticated and tenant scoped", async () => {
  let observed;
  const env = makeEnv(async (req, id) => {
    observed = { url: new URL(req.url), id, tenant: req.headers.get("X-VOOM-TENANT-ID") };
    return Response.json({ connected: true, heartbeatIntervalMs: 2000, ordersEnabled: false });
  });
  const missing = await worker.fetch(request("/status"), env);
  assert.equal(missing.status, 401);
  const response = await worker.fetch(request("/status", { token: TOKEN, tenant: TENANT_ID }), env);
  assert.equal(response.status, 200);
  assert.equal(observed.id, TENANT_ID);
  assert.equal(observed.url.pathname, "/status");
  assert.equal(observed.tenant, TENANT_ID);
  const body = await response.json();
  assert.equal(body.heartbeatIntervalMs, 2000);
  assert.equal(body.ordersEnabled, false);
});

test("status endpoint rejects non-GET methods", async () => {
  const response = await worker.fetch(request("/status", { method: "POST", token: TOKEN, tenant: TENANT_ID }), makeEnv());
  assert.equal(response.status, 405);
});

test("Durable Object status reports heartbeat freshness without persistent writes", async () => {
  const { BridgeSession } = await import("./worker.js");
  const now = Date.now();
  const socket = { readyState: 1, deserializeAttachment: () => ({ tenantId: TENANT_ID, lastHeartbeat: now }) };
  const session = new BridgeSession({ getWebSockets: () => [socket] }, {});
  const response = await session.fetch(new Request("https://bridge-session.internal/status", {
    headers: { "X-Relay-Internal": "1", "X-VOOM-TENANT-ID": TENANT_ID }
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.connected, true);
  assert.equal(body.websocketConnected, true);
  assert.equal(body.heartbeatIntervalMs, 2000);
  assert.equal(body.ordersEnabled, false);
});

test("Durable Object status fails closed when no tenant socket exists", async () => {
  const { BridgeSession } = await import("./worker.js");
  const session = new BridgeSession({ getWebSockets: () => [] }, {});
  const response = await session.fetch(new Request("https://bridge-session.internal/status", {
    headers: { "X-Relay-Internal": "1", "X-VOOM-TENANT-ID": TENANT_ID }
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "bridge_not_connected");
});

test("Durable Object records application heartbeat messages on the tenant socket", async () => {
  const { BridgeSession } = await import("./worker.js");
  let attachment = { tenantId: TENANT_ID, connectedAt: Date.now(), lastHeartbeat: null };
  const socket = {
    deserializeAttachment: () => attachment,
    serializeAttachment: (value) => { attachment = value; }
  };
  const session = new BridgeSession({ getWebSockets: () => [socket] }, {});
  session.webSocketMessage(socket, JSON.stringify({ type: "heartbeat" }));
  assert.equal(attachment.tenantId, TENANT_ID);
  assert.equal(typeof attachment.lastHeartbeat, "number");
  assert.ok(Date.now() - attachment.lastHeartbeat < 1000);
});

test("Durable Object status reports stale heartbeat as disconnected", async () => {
  const { BridgeSession } = await import("./worker.js");
  const socket = {
    readyState: 1,
    deserializeAttachment: () => ({ tenantId: TENANT_ID, lastHeartbeat: Date.now() - 10000 })
  };
  const session = new BridgeSession({ getWebSockets: () => [socket] }, {});
  const response = await session.fetch(new Request("https://bridge-session.internal/status", {
    headers: { "X-Relay-Internal": "1", "X-VOOM-TENANT-ID": TENANT_ID }
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.connected, false);
  assert.equal(body.websocketConnected, true);
  assert.ok(body.heartbeatAgeMs >= 10000);
});
