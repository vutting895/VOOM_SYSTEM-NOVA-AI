import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const env = { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "public-test-key" };
const originalFetch = globalThis.fetch;
function authFetch(status = 200, payload = { id: "user-test" }) {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://supabase.example/auth/v1/user");
    assert.equal(init.headers.apikey, "public-test-key");
    assert.match(init.headers.Authorization, /^Bearer /);
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  };
}
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("health is public but explicitly reports execution disabled", async () => {
  const response = await worker.fetch(new Request("https://worker.test/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("direct generation without bearer token is rejected", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "EMA and RSI" }),
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("invalid or expired Supabase session is rejected as 401", async () => {
  authFetch(403, { code: 403, error_code: "bad_jwt" });
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Authorization: "Bearer expired.invalid.token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "EMA and RSI" }),
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
});

test("missing Supabase Auth configuration fails closed with 503", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not be called"); };
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "EMA and RSI" }),
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_not_configured");
  assert.equal(called, false);
});

test("Supabase Auth network failures fail closed with 503", async () => {
  globalThis.fetch = async () => { throw new TypeError("simulated auth timeout"); };
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "EMA and RSI" }),
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_provider_unavailable");
});

test("valid session can create research fallback but never execution", async () => {
  authFetch();
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json", Origin: "https://voom-system-nova-ui.suwapat787.workers.dev" },
    body: JSON.stringify({ prompt: "EMA and RSI", market: "XAU/USD", timeframe: "1h", risk: "low" }),
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.strategy.status, "draft");
  assert.equal(body.strategy.source, "rule-based-fallback");
  assert.equal(body.strategy.executionEnabled, false);
  assert.equal(body.strategy.backtestStatus, "not_run");
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://voom-system-nova-ui.suwapat787.workers.dev");
});

test("untrusted browser origin is rejected", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "test" }),
  }), env);
  assert.equal(response.status, 403);
});

test("bad input and oversized payload fail closed", async () => {
  authFetch();
  const invalid = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "test", market: "UNKNOWN" }),
  }), env);
  assert.equal(invalid.status, 400);
  authFetch();
  const oversized = await worker.fetch(new Request("https://worker.test/api/gen-ai/generate", {
    method: "POST", headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "x".repeat(17000) }),
  }), env);
  assert.equal(oversized.status, 413);
});

test("unknown order route cannot execute", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/orders", {
    method: "POST", headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "XAUUSD", side: "buy" }),
  }), env);
  assert.equal(response.status, 404);
});
