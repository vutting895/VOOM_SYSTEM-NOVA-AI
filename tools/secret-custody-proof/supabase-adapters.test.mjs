import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseCustodyAdapters } from "./supabase-adapters.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CONNECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "synthetic-user-access-token-for-tests";
const BASE = "https://supabase.test";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" }
  });
}

test("session verifier calls Supabase Auth /user and retains token only for RLS lookup", async () => {
  const calls = [];
  const adapters = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), init });
      return response({ id: USER_ID });
    }
  });
  const principal = await adapters.verifySession(TOKEN);
  assert.equal(principal.subject, USER_ID);
  assert.equal(principal.accessToken, TOKEN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/auth/v1/user");
  assert.equal(calls[0].init.headers.apikey, "publishable-test-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + TOKEN);
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
});

test("owner lookup uses the verified user's JWT and existing user_id RLS boundary", async () => {
  let seen;
  const adapters = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async (url, init) => {
      seen = { url: new URL(url), init };
      return response([{
        id: CONNECTION_ID, user_id: USER_ID, provider: "exness_mt5",
        environment: "demo", status: "pending"
      }]);
    }
  });
  const principal = { subject: USER_ID, accessToken: TOKEN };
  const row = await adapters.resolveConnection(USER_ID, CONNECTION_ID, principal);
  assert.deepEqual(row, {
    ownerId: USER_ID, connectionId: CONNECTION_ID, provider: "exness_mt5",
    environment: "demo", status: "pending"
  });
  assert.equal(seen.url.pathname, "/rest/v1/broker_connections");
  assert.equal(seen.url.searchParams.get("id"), "eq." + CONNECTION_ID);
  assert.equal(seen.url.searchParams.get("user_id"), "eq." + USER_ID);
  assert.equal(seen.url.searchParams.get("select"), "id,user_id,provider,environment,status");
  assert.equal(seen.init.headers.Authorization, "Bearer " + TOKEN);
  assert.equal(seen.init.cache, "no-store");
  assert.equal(seen.init.redirect, "error");
});

test("foreign owner rows are denied even if a mocked PostgREST response returns one", async () => {
  const adapters = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async () => response([{
      id: CONNECTION_ID, user_id: OTHER_USER_ID, provider: "exness_mt5",
      environment: "demo", status: "connected"
    }])
  });
  const row = await adapters.resolveConnection(USER_ID, CONNECTION_ID, {
    subject: USER_ID, accessToken: TOKEN
  });
  assert.equal(row, null);
});

test("invalid sessions and auth provider outages fail closed", async () => {
  const invalid = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async () => response({ message: "expired" }, 401)
  });
  await assert.rejects(invalid.verifySession(TOKEN), /INVALID_SESSION/);
  const unavailable = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async () => response({ message: "down" }, 503)
  });
  await assert.rejects(unavailable.verifySession(TOKEN), /SUPABASE_UNAVAILABLE/);
});

test("caller cannot substitute a different subject or omit verified token", async () => {
  const adapters = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async () => response([])
  });
  await assert.rejects(
    adapters.resolveConnection(USER_ID, CONNECTION_ID, { subject: OTHER_USER_ID, accessToken: TOKEN }),
    /INVALID_CONNECTION_LOOKUP/
  );
  await assert.rejects(
    adapters.resolveConnection(USER_ID, CONNECTION_ID, { subject: USER_ID }),
    /INVALID_CONNECTION_LOOKUP/
  );
});

test("only HTTPS remote origins and HTTP loopback origins are accepted", () => {
  for (const url of [
    "ftp://localhost",
    "ws://127.0.0.1",
    "http://supabase.example",
    "https://user:pass@supabase.example"
  ]) {
    assert.throws(() => createSupabaseCustodyAdapters({
      supabaseUrl: url, publishableKey: "publishable-test-key"
    }), /SUPABASE_NOT_CONFIGURED/);
  }
  for (const url of ["http://localhost:54321", "http://127.0.0.1:54321", "https://supabase.example"]) {
    assert.doesNotThrow(() => createSupabaseCustodyAdapters({
      supabaseUrl: url, publishableKey: "publishable-test-key"
    }));
  }
});

test("redirects, non-HTTPS origins, and service-role substitution are not permitted", async () => {
  const redirected = createSupabaseCustodyAdapters({
    supabaseUrl: BASE, publishableKey: "publishable-test-key",
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://attacker.test" } })
  });
  await assert.rejects(redirected.verifySession(TOKEN), /SUPABASE_UNAVAILABLE/);
  assert.throws(() => createSupabaseCustodyAdapters({
    supabaseUrl: "http://supabase.example", publishableKey: "publishable-test-key"
  }), /SUPABASE_NOT_CONFIGURED/);
});
