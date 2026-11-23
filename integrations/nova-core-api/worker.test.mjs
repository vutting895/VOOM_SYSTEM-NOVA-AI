import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import worker from "./worker.js";

const env = {
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app",
  SUPABASE_URL: "https://example.supabase.co",
};
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "nova-test-key";
jwk.alg = "RS256";
jwk.use = "sig";

function request(path, options = {}) {
  return new Request("https://nova-core-api.test" + path, options);
}

async function token(claims = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid, typ: "JWT" })
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

test("health reports ok only when the configured Supabase JWKS is reachable", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://example.supabase.co/auth/v1/.well-known/jwks.json");
    assert.equal(init.redirect, "manual");
    return Response.json({ keys: [jwk] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/health"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(typeof body.version, "string");
  assert.equal(typeof body.time, "string");
  assert.equal(body.liveTrading, false);
  assert.equal(body.brokerWrites, false);
});

test("health degrades when Supabase JWKS is unreachable", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/health"), {
    ...env,
    SUPABASE_URL: "https://unreachable.example.supabase.co",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "degraded");
  assert.equal(body.liveTrading, false);
  assert.equal(body.brokerWrites, false);
});

test("health rejects JWKS bodies larger than 64 KiB without Content-Length", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(65537));
      controller.close();
    },
  }), { headers: { "Content-Type": "application/json" } });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/v1/health"), {
    ...env,
    SUPABASE_URL: "https://oversized.example.supabase.co",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "degraded");
});

test("unknown routes are not exposed", async () => {
  const response = await worker.fetch(request("/v1/bridge/status"), env);
  assert.equal(response.status, 404);
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

test("valid Supabase JWT with app_metadata role can read identity", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.supabase.co/auth/v1/.well-known/jwks.json");
    return Response.json({ keys: [jwk] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const signed = await token({
    email: "user@example.test",
    app_metadata: { nova_role: "viewer" },
    user_metadata: { nova_role: "admin" },
  });
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.id, "user-123");
  assert.equal(body.role, "viewer");
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerWritesEnabled, false);
});

test("user_metadata role is never trusted", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = originalFetch; });

  const signed = await token({ user_metadata: { nova_role: "admin" } });
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  assert.equal(response.status, 403);
});

test("wrong audience is rejected", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = originalFetch; });

  const signed = await new SignJWT({ app_metadata: { nova_role: "admin" } })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("other")
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  assert.equal(response.status, 401);
});

test("unknown role fails closed", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = originalFetch; });

  const signed = await token({ app_metadata: { nova_role: "root" } });
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  assert.equal(response.status, 403);
});

test("prototype property names are not accepted as roles", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = originalFetch; });

  const signed = await token({ app_metadata: { nova_role: "toString" } });
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  assert.equal(response.status, 403);
});

test("valid ES256 Supabase JWT can read identity", async (t) => {
  const { publicKey: ecPublicKey, privateKey: ecPrivateKey } = await generateKeyPair("ES256");
  const ecJwk = await exportJWK(ecPublicKey);
  ecJwk.kid = "nova-es256-test-key";
  ecJwk.alg = "ES256";
  ecJwk.use = "sig";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [ecJwk] });
  t.after(() => { globalThis.fetch = originalFetch; });
  const signed = await new SignJWT({ app_metadata: { nova_role: "viewer" } })
    .setProtectedHeader({ alg: "ES256", kid: ecJwk.kid, typ: "JWT" })
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setSubject("user-es256")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(ecPrivateKey);
  const response = await worker.fetch(request("/v1/me", {
    headers: { Authorization: "Bearer " + signed },
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.id, "user-es256");
  assert.equal(body.role, "viewer");
});

test("JWKS redirects are not followed", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://attacker.invalid/keys.json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await worker.fetch(request("/v1/health"), {
    ...env,
    SUPABASE_URL: "https://redirect-test.example.supabase.co",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "degraded");
  assert.equal(body.providerReason, "jwks_provider_unavailable");
});
