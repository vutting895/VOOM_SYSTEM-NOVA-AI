import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  MT5_READONLY_PROXY_URL: "https://proxy.example.workers.dev",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function installFetch({ rows = [{ id: CONNECTION_ID, provider: "exness_mt5", environment: "demo", status: "connected", bridge_route_id: "tenant-demo-01" }], symbols = [] } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/auth/v1/user") return response({ id: USER_ID });
    if (url.pathname === "/rest/v1/broker_connections") return response(rows);
    if (url.pathname === "/api/symbols") return response({
      symbols,
      count: symbols.length,
      truncated: false,
      as_of: "2026-10-31T00:00:00Z"
    });
    throw new Error("unexpected outbound URL: " + url.href);
  };
  return {
    calls,
    restore() { globalThis.fetch = original; }
  };
}

test("symbols endpoint requires an authenticated session", async () => {
  const request = new Request("https://hub.example/v1/connections/" + CONNECTION_ID + "/symbols");
  const result = await worker.fetch(request, env);
  assert.equal(result.status, 401);
});

test("symbols endpoint returns bounded, sanitized symbols through the owner's proxy route", async () => {
  const mock = installFetch({
    symbols: [
      { name: "XAUUSDm", description: "Gold", visible: true, digits: 2, base_currency: "XAU", profit_currency: "USD" },
      { name: "BTCUSDm", description: "Bitcoin", visible: false, digits: 2, base_currency: "BTC", profit_currency: "USD" },
      { name: "bad symbol", description: "must be filtered", visible: true, digits: 2 }
    ]
  });
  try {
    const request = new Request(
      "https://hub.example/v1/connections/" + CONNECTION_ID + "/symbols?q=XAU&limit=10",
      { headers: { Authorization: "Bearer test-session", Origin: "https://voomsystem.netlify.app" } }
    );
    const result = await worker.fetch(request, env);
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.dataVerified, true);
    assert.deepEqual(body.symbols.map((item) => item.name), ["XAUUSDm", "BTCUSDm"]);
    assert.equal(body.symbols[0].baseCurrency, "XAU");
    assert.equal(body.ordersEnabled, false);
    assert.equal(body.liveTradingEnabled, false);
    const proxyCall = mock.calls.find((call) => call.url.pathname === "/api/symbols");
    assert.ok(proxyCall);
    assert.equal(proxyCall.url.searchParams.get("connection_id"), CONNECTION_ID);
    assert.equal(proxyCall.url.searchParams.get("q"), "XAU");
    assert.equal(proxyCall.url.searchParams.get("limit"), "10");
    assert.equal(proxyCall.init.method, "GET");
    assert.equal(proxyCall.init.headers.Authorization, "Bearer test-session");
  } finally {
    mock.restore();
  }
});

test("foreign or missing owner connection never reaches the MT5 proxy", async () => {
  const mock = installFetch({ rows: [] });
  try {
    const request = new Request(
      "https://hub.example/v1/connections/" + CONNECTION_ID + "/symbols",
      { headers: { Authorization: "Bearer test-session" } }
    );
    const result = await worker.fetch(request, env);
    assert.equal(result.status, 404);
    assert.equal(mock.calls.some((call) => call.url.pathname === "/api/symbols"), false);
  } finally {
    mock.restore();
  }
});

test("symbols endpoint rejects invalid query bounds before proxy access", async () => {
  const mock = installFetch();
  try {
    const request = new Request(
      "https://hub.example/v1/connections/" + CONNECTION_ID + "/symbols?limit=501",
      { headers: { Authorization: "Bearer test-session" } }
    );
    const result = await worker.fetch(request, env);
    assert.equal(result.status, 400);
    assert.equal(mock.calls.some((call) => call.url.pathname === "/api/symbols"), false);
  } finally {
    mock.restore();
  }
});
