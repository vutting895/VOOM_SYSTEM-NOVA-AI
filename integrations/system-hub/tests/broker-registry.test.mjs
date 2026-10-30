import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import { listBrokerProviders } from "../broker-registry.js";

const USER_TOKEN = "test-user-access-token";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, options = {}) {
  return new Request("https://hub.test" + path, options);
}

test("provider registry contains only explicit provider identifiers", () => {
  assert.deepEqual(listBrokerProviders().map((item) => item.id), [
    "exness_mt5", "ibkr", "binance", "bybit"
  ]);
});

test("only Exness MT5 Demo uses the currently supported customer connection path", () => {
  const providers = listBrokerProviders();
  const exness = providers.find((item) => item.id === "exness_mt5");
  assert.equal(exness.status, "supported");
  assert.equal(exness.customerConnectEnabled, true);
  assert.deepEqual(exness.environments, ["demo"]);
  assert.deepEqual(exness.supportedOperations, [
    "connection_status", "health_check", "account_snapshot", "market_data"
  ]);
});

test("IBKR and CCXT providers remain blocked until their security gates pass", () => {
  for (const id of ["ibkr", "binance", "bybit"]) {
    const provider = listBrokerProviders().find((item) => item.id === id);
    assert.equal(provider.status, "planned");
    assert.equal(provider.customerConnectEnabled, false);
    assert.equal(provider.supportedOperations.length, 0);
    assert.ok(provider.blockedReason);
  }
});

test("provider registry never advertises broker mutation capabilities", () => {
  for (const provider of listBrokerProviders()) {
    assert.equal(provider.capabilities.orderSubmission, false);
    assert.equal(provider.capabilities.tradeMutation, false);
    assert.equal(provider.capabilities.withdrawal, false);
    assert.equal(provider.capabilities.transfer, false);
  }
});

test("provider catalog endpoint requires an authenticated Supabase session", async () => {
  const response = await worker.fetch(request("/v1/broker/providers"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("authenticated provider catalog is sanitized and explicitly read-only", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
    return Response.json({ id: "user-a" });
  };
  const response = await worker.fetch(request("/v1/broker/providers", {
    headers: { Authorization: "Bearer " + USER_TOKEN }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.selectionAuthority, "system_hub");
  assert.equal(body.mode, "read-only");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.providers.length, 4);
  assert.equal(JSON.stringify(body).includes("mock_secret"), false);
  assert.equal(JSON.stringify(body).includes("apiKey"), false);
});
