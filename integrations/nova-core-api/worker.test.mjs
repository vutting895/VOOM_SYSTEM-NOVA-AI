import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const env = {
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
};

function request(path, options = {}) {
  return new Request("https://nova-core-api.test" + path, options);
}

test("health is public and explicitly reports trading disabled", async () => {
  const response = await worker.fetch(request("/v1/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "nova-core-api");
  assert.equal(body.status, "degraded");
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerWritesEnabled, false);
});

test("unknown routes are not exposed", async () => {
  const response = await worker.fetch(request("/v1/bridge/status"), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "not_found");
});

test("non-GET requests are rejected", async () => {
  const response = await worker.fetch(request("/v1/me", { method: "POST" }), env);
  assert.equal(response.status, 405);
});

test("protected route requires a bearer token", async () => {
  const response = await worker.fetch(request("/v1/me"), env);
  assert.equal(response.status, 401);
});

test("unknown browser origins are rejected", async () => {
  const response = await worker.fetch(request("/v1/health", {
    headers: { Origin: "https://attacker.invalid" },
  }), env);
  assert.equal(response.status, 403);
});

test("authenticated user with approved app_metadata role can read own identity", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://example.supabase.co/auth/v1/user");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Authorization, "Bearer valid-test-token");
    return Response.json({
      id: "user-123",
      email: "user@example.test",
      app_metadata: { nova_role: "viewer" },
      user_metadata: { nova_role: "admin" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer valid-test-token" },
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.id, "user-123");
  assert.equal(body.user.role, "viewer");
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("role from user_metadata is not trusted", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    id: "user-123",
    user_metadata: { nova_role: "admin" },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer valid-test-token" },
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "role_not_authorized");
});

test("Supabase redirects fail closed", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { Location: "https://attacker.invalid/steal" },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer valid-test-token" },
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_provider_unavailable");
});
