import test from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import worker, { authorizeClaims } from "./worker.js";

const env = { ALLOWED_ORIGIN: "https://voomsystem.netlify.app" };

test("public health reports degraded until dependencies are verified and keeps trading disabled", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.liveTrading, false);
  assert.equal(body.brokerWrites, false);
});
test("rejects non-GET methods", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health", { method: "POST" }), env);
  assert.equal(response.status, 405);
});
test("unknown and write-like routes are not exposed", async () => {
  for (const path of ["/v1/orders", "/v1/bridge/execute", "/v1/withdrawals", "/anything"]) {
    const response = await worker.fetch(new Request("https://core.example" + path), env);
    assert.equal(response.status, 404);
  }
});
test("protected routes require bearer authentication", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/me"), env);
  assert.equal(response.status, 401);
});
test("rejects unapproved origins", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health", { headers: { Origin: "https://attacker.example" } }), env);
  assert.equal(response.status, 403);
});
test("authorization uses trusted app_metadata only and enforces role hierarchy", () => {
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "viewer" } }, "viewer").ok, true);
  assert.equal(authorizeClaims({ sub: "u1", user_metadata: { nova_role: "admin" } }, "viewer").status, 403);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "viewer" } }, "operator").status, 403);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "operator" } }, "operator").ok, true);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "root" } }, "viewer").status, 403);
});

async function makeSignedToken({ privateKey, kid, issuer, audience = "authenticated", expiresAt = "2h", role = "viewer" }) {
  return new SignJWT({ app_metadata: { nova_role: role } })
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("customer-user-001")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

async function withMockJwks({ jwksUrl, jwksResponse, extraFetch, run }) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method || "GET" });
    if (url === jwksUrl) return jwksResponse();
    if (extraFetch) return extraFetch(input, init);
    throw new Error("Unexpected outbound request: " + url);
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function createAuthFixture(suffix) {
  const projectUrl = `https://nova-auth-${suffix}.example.test`;
  const issuer = projectUrl + "/auth/v1";
  const jwksUrl = issuer + "/.well-known/jwks.json";
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "nova-test-key-" + suffix;
  jwk.alg = "ES256";
  jwk.use = "sig";
  return { projectUrl, issuer, jwksUrl, privateKey, jwk, kid: jwk.kid };
}

test("JWT integration accepts a valid ES256 Supabase session and reaches the authenticated route", async () => {
  const fixture = await createAuthFixture("valid");
  const token = await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer });
  const testEnv = { ...env, SUPABASE_URL: fixture.projectUrl };
  await withMockJwks({
    jwksUrl: fixture.jwksUrl,
    jwksResponse: () => new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    run: async (requests) => {
      const response = await worker.fetch(new Request("https://core.example/v1/me", { headers: { Authorization: "Bearer " + token } }), testEnv);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id: "customer-user-001", email: null, role: "viewer" });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, fixture.jwksUrl);
    },
  });
});

test("JWT integration rejects a token signed by an untrusted key", async () => {
  const trusted = await createAuthFixture("bad-signature");
  const attacker = await generateKeyPair("ES256");
  const token = await makeSignedToken({ privateKey: attacker.privateKey, kid: trusted.kid, issuer: trusted.issuer });
  await withMockJwks({
    jwksUrl: trusted.jwksUrl,
    jwksResponse: () => new Response(JSON.stringify({ keys: [trusted.jwk] }), { status: 200 }),
    run: async () => {
      const response = await worker.fetch(new Request("https://core.example/v1/me", { headers: { Authorization: "Bearer " + token } }), { ...env, SUPABASE_URL: trusted.projectUrl });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "invalid_or_expired_session");
    },
  });
});

test("JWT integration rejects incorrect issuer, audience, and expired sessions", async () => {
  const fixture = await createAuthFixture("claims");
  await withMockJwks({
    jwksUrl: fixture.jwksUrl,
    jwksResponse: () => new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200 }),
    run: async () => {
      const invalidTokens = [
        await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer + "/attacker" }),
        await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer, audience: "other-audience" }),
        await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer, expiresAt: Math.floor(Date.now() / 1000) - 60 }),
      ];
      for (const token of invalidTokens) {
        const response = await worker.fetch(new Request("https://core.example/v1/me", { headers: { Authorization: "Bearer " + token } }), { ...env, SUPABASE_URL: fixture.projectUrl });
        assert.equal(response.status, 401);
      }
    },
  });
});

test("JWT integration fails closed when the JWKS endpoint is unavailable", async () => {
  const fixture = await createAuthFixture("jwks-down");
  const token = await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer });
  await withMockJwks({
    jwksUrl: fixture.jwksUrl,
    jwksResponse: () => new Response("unavailable", { status: 503 }),
    run: async () => {
      const response = await worker.fetch(new Request("https://core.example/v1/me", { headers: { Authorization: "Bearer " + token } }), { ...env, SUPABASE_URL: fixture.projectUrl });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "invalid_or_expired_session");
    },
  });
});


test("authenticated approvals read forwards the customer JWT to the nova schema and remains GET-only", async () => {
  const fixture = await createAuthFixture("postgrest-read");
  const token = await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer, role: "operator" });
  const testEnv = { ...env, SUPABASE_URL: fixture.projectUrl, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_placeholder" };
  let postgrestRequest;
  await withMockJwks({
    jwksUrl: fixture.jwksUrl,
    jwksResponse: () => new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200 }),
    extraFetch: async (input, init) => {
      postgrestRequest = { url: new URL(String(input)), init };
      return new Response(JSON.stringify([{ id: "approval-1", kind: "demo_review", requested_by: "customer-user-001", created_at: "2026-11-23T00:00:00Z", status: "pending", decided_by: null }]), { status: 200, headers: { "Content-Type": "application/json" } });
    },
    run: async () => {
      const response = await worker.fetch(new Request("https://core.example/v1/approvals", { headers: { Authorization: "Bearer " + token } }), testEnv);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].id, "approval-1");
      assert.equal(postgrestRequest.init.method, "GET");
      assert.equal(postgrestRequest.url.pathname, "/rest/v1/approvals");
      assert.equal(postgrestRequest.url.searchParams.get("limit"), "50");
      assert.equal(postgrestRequest.init.headers.Authorization, "Bearer " + token);
      assert.equal(postgrestRequest.init.headers.apikey, "sb_publishable_test_placeholder");
      assert.equal(postgrestRequest.init.headers["Accept-Profile"], "nova");
      assert.equal(postgrestRequest.init.headers["Content-Type"], undefined);
    },
  });
});

test("viewer role cannot access operator-only approvals data", async () => {
  const fixture = await createAuthFixture("viewer-approvals");
  const token = await makeSignedToken({ privateKey: fixture.privateKey, kid: fixture.kid, issuer: fixture.issuer, role: "viewer" });
  let postgrestCalled = false;
  await withMockJwks({
    jwksUrl: fixture.jwksUrl,
    jwksResponse: () => new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200 }),
    extraFetch: async () => { postgrestCalled = true; return new Response("unexpected", { status: 500 }); },
    run: async () => {
      const response = await worker.fetch(new Request("https://core.example/v1/approvals", { headers: { Authorization: "Bearer " + token } }), { ...env, SUPABASE_URL: fixture.projectUrl, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_placeholder" });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "insufficient_role");
      assert.equal(postgrestCalled, false);
    },
  });
});
