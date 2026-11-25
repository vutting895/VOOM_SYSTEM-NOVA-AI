import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const TOKEN = "approval-test-user-token";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app",
  NOVA_APPROVALS_ENABLED: "false"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, options = {}) {
  return new Request("https://hub.test" + path, options);
}

test("approval API rejects unauthenticated callers before feature-gate response", async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls += 1; throw new Error("must not call upstream"); };
  const response = await worker.fetch(request("/v1/agent/threads"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
  assert.equal(upstreamCalls, 0);
});

test("approval API remains disabled for authenticated callers and exposes no execution capability", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init = {}) => {
    calls += 1;
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
    return Response.json({ id: "user-a" });
  };
  const response = await worker.fetch(request("/v1/agent/threads", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error, "approval_workflow_disabled");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerMutationEnabled, false);
  assert.equal(calls, 1);
});

test("approval thread listing is scoped to the verified Supabase user and forwards their JWT", async () => {
  const enabledEnv = { ...env, NOVA_APPROVALS_ENABLED: "true" };
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    calls.push({ url, init });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-a" });
    if (url.pathname === "/rest/v1/nova_agent_threads") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      assert.equal(url.searchParams.get("limit"), "50");
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      return Response.json([{ id: "thread-a", title: "Review", state: "active" }]);
    }
    throw new Error("Unexpected upstream request: " + url.pathname);
  };
  const response = await worker.fetch(request("/v1/agent/threads", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), enabledEnv);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.threads[0].id, "thread-a");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(calls.length, 2);
});
