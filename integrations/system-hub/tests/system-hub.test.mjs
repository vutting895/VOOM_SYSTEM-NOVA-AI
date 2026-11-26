import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const UI_ORIGIN = "https://voomsystem.netlify.app";
const FALLBACK_UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const USER_TOKEN = "test-user-access-token";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000000";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: UI_ORIGIN + "," + FALLBACK_UI_ORIGIN,
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

test("same-origin Supabase Auth redirects are followed with the configured HTTPS origin only", async () => {
  let calls = 0;
  const seenOrigins = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    seenOrigins.push(url.origin);
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 302, headers: { Location: "/auth/v1/user" } });
      return Response.json({ message: "invalid session" }, { status: 401 });
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
  assert.equal(calls, 2);
  assert.deepEqual(seenOrigins, ["https://supabase.test", "https://supabase.test"]);
});

test("external Supabase Auth redirects fail closed without forwarding credentials", async () => {
  const seenOrigins = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    seenOrigins.push(url.origin);
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://attacker.example/collect" } });
  };
  const response = await worker.fetch(request("/v1/integrations", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_provider_unavailable");
  assert.deepEqual(seenOrigins, ["https://supabase.test"]);
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


test("signed-in user can create one pending Exness Demo connection request", async () => {
  const original = globalThis.fetch;
  let insertPayload = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      if (init.method === "POST") {
        assert.equal(url.searchParams.get("on_conflict"), "user_id,provider,environment");
        insertPayload = JSON.parse(init.body);
        assert.equal(insertPayload.provider, "exness_mt5");
        assert.equal(insertPayload.environment, "demo");
        assert.equal(insertPayload.status, "pending");
        assert.equal(Object.hasOwn(insertPayload, "bridge_route_id"), false);
        return Response.json([{
          id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5",
          environment: "demo", status: "pending", account_label: "Exness MT5 Demo",
          bridge_route_id: null, created_at: "2026-10-29T00:00:00Z"
        }], { status: 201 });
      }
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      return Response.json([]);
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/v1/connections", {
      method: "POST",
      headers: { Authorization: "Bearer " + USER_TOKEN, Origin: UI_ORIGIN, "Content-Type": "application/json" }
    }), env);
    const bodyText = await response.text();
    const body = JSON.parse(bodyText);
    assert.equal(response.status, 201);
    assert.equal(body.created, true);
    assert.equal(body.connection.recordStatus, "pending");
    assert.equal(body.connection.readiness, "pending_provisioning");
    assert.equal(body.ordersEnabled, false);
    assert.equal(body.liveTradingEnabled, false);
    assert.doesNotMatch(bodyText, /bridge_route_id|access_token|password/);
    assert.ok(insertPayload);
  } finally {
    globalThis.fetch = original;
  }
});

test("account endpoint returns a minimal read-only account summary through the user's own connection", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      return Response.json([{
        id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
        status: "connected", account_label: "Exness MT5 Demo", bridge_route_id: "tenant-a"
      }]);
    }
    if (url.origin === "https://voom-mt5-readonly-proxy.suwapat787.workers.dev" && url.pathname === "/api/account") {
      assert.equal(url.searchParams.get("connection_id"), CONNECTION_ID);
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      return Response.json({
        connected: true, server: "Exness-Demo", currency: "USD", balance: 1000,
        equity: 1002, margin: 10, free_margin: 992, margin_level: 10020,
        account_number: "private-test-value", terminal_trade_allowed: true,
        order_submission_enabled: false, mode: "read-only", as_of: "2026-10-29T04:00:00Z"
      });
    }
    throw new Error("Unexpected external request: " + url.origin + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/v1/connections/" + CONNECTION_ID + "/account", {
      headers: { Authorization: "Bearer " + USER_TOKEN, Origin: UI_ORIGIN }
    }), env);
    const bodyText = await response.text();
    const body = JSON.parse(bodyText);
    assert.equal(response.status, 200);
    assert.equal(body.state, "data_verified");
    assert.equal(body.dataVerified, true);
    assert.equal(body.account.connected, true);
    assert.equal(body.account.balance, 1000);
    assert.equal(body.account.equity, 1002);
    assert.equal(body.account.mode, "read-only");
    assert.equal(body.account.order_submission_enabled, false);
    assert.doesNotMatch(bodyText, /private-test-value|account_number|bridge_route_id|access_token/);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), UI_ORIGIN);
  } finally {
    globalThis.fetch = original;
  }
});

test("quotes endpoint only forwards bounded read-only symbol/timeframe/count", async () => {
  const original = globalThis.fetch;
  let requestedQuote = null;
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
    if (url.origin === "https://voom-mt5-readonly-proxy.suwapat787.workers.dev" && url.pathname === "/api/quotes") {
      requestedQuote = {
        connectionId: url.searchParams.get("connection_id"),
        symbol: url.searchParams.get("symbol"),
        timeframe: url.searchParams.get("timeframe"),
        count: url.searchParams.get("count"),
        authorization: init.headers.Authorization
      };
      return Response.json({
        symbol: "XAUUSDm", timeframe: "M1", digits: 3,
        tick: { bid: 4038.9, ask: 4039.1, last: 0, time: "2026-10-29T04:55:00Z" },
        bars: [{ time: "2026-10-29T04:55:00Z", open: 4038.8, high: 4039.2, low: 4038.7, close: 4039.0 }],
        count: 1, order_submission_enabled: false, mode: "read-only", as_of: "2026-10-29T04:55:00Z"
      });
    }
    throw new Error("Unexpected external request: " + url.origin + url.pathname);
  };
  try {
    const response = await worker.fetch(request(
      "/v1/connections/" + CONNECTION_ID + "/quotes?symbol=XAUUSDm&timeframe=M1&count=3",
      { headers: { Authorization: "Bearer " + USER_TOKEN } }
    ), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.state, "data_verified");
    assert.equal(body.quote.symbol, "XAUUSDm");
    assert.equal(body.quote.tick.bid, 4038.9);
    assert.equal(body.quote.bars.length, 1);
    assert.equal(body.quote.order_submission_enabled, false);
    assert.deepEqual(requestedQuote, {
      connectionId: CONNECTION_ID, symbol: "XAUUSDm", timeframe: "M1", count: "3",
      authorization: "Bearer " + USER_TOKEN
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("quotes with invalid bounds fail before making an upstream request", async () => {
  mockAuthAndRest({ rows: [{
    id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
    status: "connected", bridge_route_id: "tenant-a"
  }] });
  const response = await worker.fetch(request(
    "/v1/connections/" + CONNECTION_ID + "/quotes?symbol=XAUUSDm&timeframe=M1&count=501",
    { headers: { Authorization: "Bearer " + USER_TOKEN } }
  ), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "count_must_be_between_1_and_500");
});

test("account read does not reach proxy while a connection remains pending", async () => {
  const original = globalThis.fetch;
  let proxyCalled = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://supabase.test" && url.pathname === "/rest/v1/broker_connections") {
      return Response.json([{
        id: CONNECTION_ID, user_id: "user-a", provider: "exness_mt5", environment: "demo",
        status: "pending", account_label: "Exness MT5 Demo", bridge_route_id: null
      }]);
    }
    proxyCalled = true;
    throw new Error("Pending route must not call the proxy");
  };
  try {
    const response = await worker.fetch(request("/v1/connections/" + CONNECTION_ID + "/account", {
      headers: { Authorization: "Bearer " + USER_TOKEN }
    }), env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).state, "pending_provisioning");
    assert.equal(proxyCalled, false);
  } finally {
    globalThis.fetch = original;
  }
});


test("QuantLab POST idempotency header is permitted by CORS preflight", async () => {
  const response = await worker.fetch(request("/v1/quantlab/jobs", {
    method: "OPTIONS",
    headers: {
      Origin: UI_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,idempotency-key"
    }
  }), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers") || "", /Idempotency-Key/i);
});

test("QuantLab capabilities are authenticated and explicitly report unconfigured worker", async () => {
  const denied = await worker.fetch(request("/v1/quantlab/capabilities"), env);
  assert.equal(denied.status, 401);
  mockAuthAndRest();
  const response = await worker.fetch(request("/v1/quantlab/capabilities", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, false);
  assert.equal(body.workerStatus, "not_probed");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("QuantLab job creation validates bounded research-only payload before dispatch", async () => {
  mockAuthAndRest();
  const invalid = await worker.fetch(request("/v1/quantlab/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer " + USER_TOKEN, "Content-Type": "application/json", "Idempotency-Key": "idem-key-12345678" },
    body: JSON.stringify({ job_type: "order", experiment: {} })
  }), { ...env, QUANTLAB_WORKER_URL: "https://quantlab-worker.workers.dev", QUANTLAB_WORKER_ALLOWED_HOSTS: "quantlab-worker.workers.dev" });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "invalid_quant_job_request");
});

test("QuantLab job creation requires idempotency and never accepts client tenant identity", async () => {
  mockAuthAndRest();
  const missingKey = await worker.fetch(request("/v1/quantlab/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer " + USER_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ job_type: "backtest", experiment: {} })
  }), { ...env, QUANTLAB_WORKER_URL: "https://quantlab-worker.workers.dev", QUANTLAB_WORKER_ALLOWED_HOSTS: "quantlab-worker.workers.dev" });
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).error, "valid_idempotency_key_required");

  const tenantSpoof = await worker.fetch(request("/v1/quantlab/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer " + USER_TOKEN, "Content-Type": "application/json", "Idempotency-Key": "idem-key-12345678" },
    body: JSON.stringify({ job_type: "backtest", experiment: {}, tenant_id: "victim" })
  }), { ...env, QUANTLAB_WORKER_URL: "https://quantlab-worker.workers.dev", QUANTLAB_WORKER_ALLOWED_HOSTS: "quantlab-worker.workers.dev" });
  assert.equal(tenantSpoof.status, 400);
  assert.equal((await tenantSpoof.json()).error, "invalid_quant_job_request");
});

test("QuantLab job creation forwards verified session and bounded payload to configured worker", async () => {
  const original = globalThis.fetch;
  let workerCall = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: "user-a" });
    }
    if (url.origin === "https://quantlab-worker.workers.dev" && url.pathname === "/v1/jobs") {
      workerCall = { url, init, payload: JSON.parse(init.body) };
      return Response.json({ job: { job_id: "job-123", state: "QUEUED" }, ordersEnabled: false }, { status: 202 });
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/v1/quantlab/jobs", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + USER_TOKEN,
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-key-12345678",
        Origin: UI_ORIGIN
      },
      body: JSON.stringify({ job_type: "backtest", resource_profile: "free-cpu", timeout_seconds: 600, experiment: { spec: "nova.quant-experiment.v1" } })
    }), { ...env, QUANTLAB_WORKER_URL: "https://quantlab-worker.workers.dev", QUANTLAB_WORKER_ALLOWED_HOSTS: "quantlab-worker.workers.dev" });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.job.job_id, "job-123");
    assert.equal(workerCall.init.method, "POST");
    assert.equal(workerCall.init.headers.Authorization, "Bearer " + USER_TOKEN);
    assert.equal(workerCall.init.headers["Idempotency-Key"], "idem-key-12345678");
    assert.equal(workerCall.payload.job_type, "backtest");
    assert.equal(Object.hasOwn(workerCall.payload, "tenant_id"), false);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), UI_ORIGIN);
  } finally {
    globalThis.fetch = original;
  }
});

test("QuantLab list and event routes preserve tenant bearer token and bounded filters", async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") return Response.json({ id: "user-a" });
    if (url.origin === "https://quantlab-worker.workers.dev") {
      seen.push({ pathname: url.pathname, limit: url.searchParams.get("limit"), state: url.searchParams.get("state"), auth: init.headers.Authorization });
      return Response.json({ jobs: [], events: [] });
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  try {
    const config = { ...env, QUANTLAB_WORKER_URL: "https://quantlab-worker.workers.dev", QUANTLAB_WORKER_ALLOWED_HOSTS: "quantlab-worker.workers.dev" };
    const list = await worker.fetch(request("/v1/quantlab/jobs?limit=20&state=RUNNING", {
      headers: { Authorization: "Bearer " + USER_TOKEN }
    }), config);
    assert.equal(list.status, 200);
    const events = await worker.fetch(request("/v1/quantlab/jobs/job-123/events", {
      headers: { Authorization: "Bearer " + USER_TOKEN }
    }), config);
    assert.equal(events.status, 200);
    assert.deepEqual(seen, [
      { pathname: "/v1/jobs", limit: "20", state: "RUNNING", auth: "Bearer " + USER_TOKEN },
      { pathname: "/v1/jobs/job-123/events", limit: null, state: null, auth: "Bearer " + USER_TOKEN }
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("QuantLab proxy rejects unsafe worker URLs and never follows redirects", async () => {
  mockAuthAndRest();
  const bad = await worker.fetch(request("/v1/quantlab/jobs", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), { ...env, QUANTLAB_WORKER_URL: "https://attacker.example" });
  assert.equal(bad.status, 503);
  assert.equal((await bad.json()).error, "quantlab_worker_url_invalid");
});

test("Cloudflare fallback frontend origin remains allowed during Netlify cutover", async () => {
  const response = await worker.fetch(request("/health", {
    headers: { Origin: FALLBACK_UI_ORIGIN }
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), FALLBACK_UI_ORIGIN);
});
