import test from "node:test";
import assert from "node:assert/strict";
import { handler as priceHandler } from "../netlify/functions/price.js";
import { handler as portfolioHandler } from "../netlify/functions/portfolio.js";
import { handler as historyHandler } from "../netlify/functions/history.js";
import { handler as tradeHandler } from "../netlify/functions/trade.js";
import { handler as authConfigHandler } from "../netlify/functions/auth-config.js";
import { handler as aiProxyHandler } from "../netlify/functions/ai-proxy.js";
import { handler as apiNotFoundHandler } from "../netlify/functions/api-not-found.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("auth config proxies only public Supabase client settings", async () => {
  const previous = process.env.NOVA_SYSTEM_HUB_URL;
  process.env.NOVA_SYSTEM_HUB_URL = "https://voom-system-hub.suwapat787.workers.dev";
  let observed;
  globalThis.fetch = async (input, init = {}) => {
    observed = { url: new URL(String(input)), init };
    return Response.json({
      supabaseUrl: "https://nova-project.supabase.co",
      publishableKey: "sb_publishable_test_key_with_sufficient_length",
      keyType: "publishable"
    });
  };
  try {
    const response = await authConfigHandler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.supabaseUrl, "https://nova-project.supabase.co");
    assert.equal(body.keyType, "publishable");
    assert.equal(observed.url.pathname, "/v1/public/auth-config");
    assert.equal(observed.init.headers.authorization, undefined);
  } finally {
    if (previous === undefined) delete process.env.NOVA_SYSTEM_HUB_URL;
    else process.env.NOVA_SYSTEM_HUB_URL = previous;
  }
});

test("AI proxy forwards only allowlisted research routes with the caller's bearer token", async () => {
  let observed;
  globalThis.fetch = async (input, init = {}) => {
    observed = { url: new URL(String(input)), init };
    return Response.json({ ok: true, executionEnabled: false });
  };
  const response = await aiProxyHandler({
    httpMethod: "POST",
    headers: { authorization: "Bearer supabase-session-token" },
    queryStringParameters: { target: "chat" },
    body: JSON.stringify({ messages: [{ role: "user", content: "test" }] })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(observed.url.origin, "https://voom-system-nova-ai.suwapat787.workers.dev");
  assert.equal(observed.url.pathname, "/api/chat");
  assert.equal(observed.init.headers.Authorization, "Bearer supabase-session-token");
  assert.equal(observed.init.redirect, "error");
});

test("unsupported API paths return JSON 501 instead of the SPA HTML fallback", async () => {
  const response = await apiNotFoundHandler({
    httpMethod: "GET",
    queryStringParameters: { path: "intelligence/models" }
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 501);
  assert.equal(body.error, "API_ROUTE_NOT_IMPLEMENTED");
  assert.equal(body.route, "/api/intelligence/models");
  assert.equal(body.liveTradingEnabled, false);
});

test("Binance public price route returns public market data without credentials", async () => {
  let observed;
  globalThis.fetch = async (input, init = {}) => {
    observed = { url: new URL(String(input)), init };
    return Response.json({ symbol: "BTCUSDT", price: "67234.12000000" });
  };
  const response = await priceHandler({
    httpMethod: "GET",
    headers: {},
    queryStringParameters: { provider: "binance", symbol: "BTCUSDT" }
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.price, "67234.12000000");
  assert.equal(body.ordersEnabled, false);
  assert.equal(observed.url.origin, "https://data-api.binance.vision");
  assert.equal(observed.init.headers, undefined);
});

test("portfolio route requires a signed-in user token", async () => {
  const response = await portfolioHandler({ httpMethod: "GET", headers: {}, queryStringParameters: {} });
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, "authentication_required");
});

test("history rejects an invalid range before contacting the broker", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not fetch"); };
  const response = await historyHandler({
    httpMethod: "GET",
    headers: {},
    queryStringParameters: { from_ts: "1", to_ts: "2", limit: "501" }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test("trade endpoint always rejects order submission", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("trade must never reach broker"); };
  const response = await tradeHandler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ symbol: "XAUUSDm", side: "buy" }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 403);
  assert.equal(body.error, "BROKER_WRITES_DISABLED");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(called, false);
});
