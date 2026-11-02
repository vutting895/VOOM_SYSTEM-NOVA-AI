import test from "node:test";
import assert from "node:assert/strict";
import worker, { dispatchDaily } from "./worker.js";

test("health is public and explicitly orchestration-only", async () => {
  const response = await worker.fetch(new Request("https://scheduler.test/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "orchestration-only");
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("unknown routes are rejected", async () => {
  const response = await worker.fetch(new Request("https://scheduler.test/run", { method: "POST" }), {});
  assert.equal(response.status, 404);
});

test("missing GitHub dispatch token fails closed", async () => {
  await assert.rejects(dispatchDaily({}, 1793650500000), /github_dispatch_not_configured/);
});

test("dispatch is pinned to the approved repository and data-only event", async () => {
  const originalFetch = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, init) => {
    observed = { url: String(url), init, payload: JSON.parse(init.body) };
    return new Response(null, { status: 204 });
  };
  try {
    const result = await dispatchDaily({ GITHUB_DISPATCH_TOKEN: "test-token" }, 1793650500000);
    assert.equal(result.accepted, true);
    assert.equal(observed.url, "https://api.github.com/repos/vutting895/VOOM_SYSTEM-NOVA-AI/dispatches");
    assert.equal(observed.payload.event_type, "nova-wave3-daily-cloud");
    assert.equal(observed.payload.client_payload.execution_enabled, false);
    assert.equal(observed.payload.client_payload.live_trading_enabled, false);
    assert.equal(observed.init.headers.Authorization, "Bearer test-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub dispatch failure is surfaced without exposing response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("sensitive provider detail", { status: 401 });
  try {
    await assert.rejects(dispatchDaily({ GITHUB_DISPATCH_TOKEN: "test-token" }, 1793650500000), /github_dispatch_failed_401/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
