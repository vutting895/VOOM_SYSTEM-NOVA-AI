import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const UI_ORIGIN = "https://voomsystem.netlify.app";
const FALLBACK_UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const ENDPOINT = "https://voom-system-mcp.test/mcp";

function makeRequest({ origin, token, protocolVersion = "2025-03-26" } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion }
    })
  });
}

test("rejects an untrusted Origin before authentication or MCP dispatch", async () => {
  const response = await worker.fetch(makeRequest({
    origin: "https://attacker.invalid",
    token: "test-token-not-a-secret"
  }), {});

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("rejects an untrusted Origin on the public health route too", async () => {
  const response = await worker.fetch(new Request("https://voom-system-mcp.test/health", {
    method: "GET",
    headers: { Origin: "https://attacker.invalid" }
  }), {});

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
});

test("allows non-browser clients without Origin but still requires authentication", async () => {
  const response = await worker.fetch(makeRequest(), {});

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("preserves supported protocol 2025-03-26 negotiation for an authenticated client", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-user-token");
    return new Response(JSON.stringify({ id: "mcp-contract-test-user" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    for (const origin of [UI_ORIGIN, FALLBACK_UI_ORIGIN]) {
      const response = await worker.fetch(makeRequest({
        origin,
        token: "test-user-token"
      }), {
        SUPABASE_URL: "https://test.supabase.invalid",
        SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      const payload = await response.json();
      assert.equal(payload.result.protocolVersion, "2025-03-26");
      assert.deepEqual(payload.result.capabilities, { tools: {} });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
