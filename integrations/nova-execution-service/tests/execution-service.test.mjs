import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

function request(path, init = {}) { return new Request("https://execution.test" + path, init); }

test("health reports the isolated execution service as disabled", async () => {
  const response = await worker.fetch(request("/health"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.service, "nova-execution-service");
  assert.equal(result.state, "disabled");
  assert.equal(result.implementation, "contract-stub");
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});

test("execution status cannot be enabled by query parameters", async () => {
  const response = await worker.fetch(request("/v1/trading/execution/status?executionEnabled=true&liveTradingEnabled=true"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.state, "disabled");
  assert.equal(result.acceptedIntents, false);
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});

test("intent submission is rejected without parsing or forwarding the body", async () => {
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => { outboundCalls += 1; throw new Error("Execution stub must never make outbound requests"); };
  try {
    const response = await worker.fetch(request("/v1/trading/intents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "XAUUSDm", side: "BUY", executionEnabled: true, liveTradingEnabled: true, tenantId: "forged-tenant" })
    }));
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.error, "execution_disabled");
    assert.equal(result.state, "not_executed");
    assert.equal(result.ordersEnabled, false);
    assert.equal(result.executionEnabled, false);
    assert.equal(result.liveTradingEnabled, false);
    assert.equal(outboundCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("intent lookup fails closed while no durable intent store exists", async () => {
  const response = await worker.fetch(request("/v1/trading/intents/intent_123"));
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.equal(result.error, "intent_store_not_configured");
  assert.equal(result.state, "unavailable");
  assert.equal(result.intentId, "intent_123");
  assert.equal(result.executionEnabled, false);
});

test("unsupported methods and paths do not expose execution capabilities", async () => {
  const response = await worker.fetch(request("/v1/trading/intents", { method: "PUT" }));
  const result = await response.json();
  assert.equal(response.status, 404);
  assert.equal(result.error, "not_found");
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});
