import test from "node:test";
import assert from "node:assert/strict";
import adapter from "./worker.js";

const TOKEN = "staging-only-placeholder-token-value-never-deployed";
const ADAPTER_TOKEN = "test-only-private-adapter-token-with-32-bytes-minimum";
const env = {
  NOVA_QUANT_RUNTIME_ORIGIN: "https://quant-runtime.example.test",
  NOVA_QUANT_M2M_TOKEN: TOKEN,
  QUANT_ADAPTER_M2M_TOKEN: ADAPTER_TOKEN,
};
const request = (path, body) => new Request("https://adapter.test" + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ADAPTER_TOKEN },
  body: JSON.stringify(body),
});

test("does not operate without runtime origin and internal token", async () => {
  const response = await adapter.fetch(request("/v1/mt5/decision", {
    event: {}, execution_enabled: false,
  }), {});
  assert.equal(response.status, 503);
});
test("rejects non-HTTPS runtime configuration", async () => {
  const response = await adapter.fetch(request("/v1/mt5/decision", {
    event: {}, execution_enabled: false,
  }), { ...env, NOVA_QUANT_RUNTIME_ORIGIN: "http://localhost:8000" });
  assert.equal(response.status, 503);
});
test("rejects missing private service-binding authentication", async () => {
  const unauthenticated = new Request("https://adapter.test/v1/mt5/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: {}, execution_enabled: false }),
  });
  const response = await adapter.fetch(unauthenticated, env);
  assert.equal(response.status, 401);
});
test("rejects routes outside the fixed allowlist", async () => {
  const response = await adapter.fetch(new Request("https://adapter.test/proxy?url=https://attacker.test"));
  assert.equal(response.status, 404);
});
test("forwards decision request only to the configured Python endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, init) => {
    observed = { url: String(url), init };
    return Response.json({
      engine: "MT5HeuristicConsensusAdapter",
      evaluation_status: "research_only",
      execution_enabled: false,
    });
  };
  try {
    const payload = { event: { schema_version: "nova.mt5-event.v2", event_id: "ea-test-0001", module_votes: [] }, execution_enabled: false };
    const response = await adapter.fetch(request("/v1/mt5/decision", payload), env);
    assert.equal(response.status, 200);
    assert.equal(observed.url, "https://quant-runtime.example.test/v1/mt5/decision");
    assert.equal(observed.init.headers.Authorization, "Bearer " + TOKEN);
    assert.equal(JSON.parse(observed.init.body).execution_enabled, false);
    assert.equal((await response.json()).engine, "MT5HeuristicConsensusAdapter");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("rejects decision payloads that attempt to enable execution", async () => {
  const response = await adapter.fetch(request("/v1/mt5/decision", {
    event: {}, execution_enabled: true,
  }), env);
  assert.equal(response.status, 400);
});
