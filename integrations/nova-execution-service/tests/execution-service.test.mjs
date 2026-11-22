import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const TOKEN = "execution-test-token";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, init = {}) {
  return new Request("https://execution.test" + path, init);
}
function mockAuth(status = 200) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
    assert.equal(init.redirect, "error");
    return status === 200 ? Response.json({ id: "tenant-user" }) : new Response("{}", { status });
  };
}

test("health reports the isolated execution service as disabled", async () => {
  const response = await worker.fetch(request("/health"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.service, "nova-execution-service");
  assert.equal(result.state, "disabled");
  assert.equal(result.executionEnabled, false);
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
  assert.equal(result.riskGatewayConfigured, false);
  assert.equal(result.riskPolicyState, "blocked_incomplete_policy");
});

test("execution status requires a valid authenticated Supabase session", async () => {
  const missing = await worker.fetch(request("/v1/trading/execution/status"), env);
  assert.equal(missing.status, 401);
  mockAuth();
  const response = await worker.fetch(request("/v1/trading/execution/status", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.authenticated, true);
  assert.equal(result.state, "disabled");
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
  assert.equal(result.riskPolicyState, "blocked_incomplete_policy");
  assert.ok(result.missingRiskSettings.includes("perTradeRiskPct"));
});

test("intent submission remains rejected even when request payload attempts to enable trading", async () => {
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    return Response.json({ id: "tenant-user" });
  };
  const response = await worker.fetch(request("/v1/trading/intents", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "XAUUSDm", side: "BUY", executionEnabled: true, liveTradingEnabled: true })
  }), env);
  const result = await response.json();
  assert.equal(response.status, 423);
  assert.equal(result.error, "execution_disabled");
  assert.equal(result.state, "not_accepted");
  assert.equal(result.intentAccepted, false);
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
  assert.equal(outboundCalls, 1, "only the Supabase Auth validation call is allowed");
});

test("invalid Supabase session is rejected before intent handling", async () => {
  mockAuth(401);
  const response = await worker.fetch(request("/v1/trading/intents", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN },
    body: "{}"
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
});

test("intent lookup fails closed while no durable tenant-scoped store exists", async () => {
  mockAuth();
  const response = await worker.fetch(request("/v1/trading/intents/intent_123", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), env);
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.equal(result.error, "intent_store_not_configured");
  assert.equal(result.state, "unavailable");
});

test("unsupported methods and paths do not expose execution capabilities", async () => {
  const response = await worker.fetch(request("/api/orders", { method: "POST" }));
  const result = await response.json();
  assert.equal(response.status, 404);
  assert.equal(result.error, "not_found");
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});
