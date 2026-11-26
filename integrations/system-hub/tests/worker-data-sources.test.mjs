import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const ENV = {
  SUPABASE_URL: "https://nova-test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};
const TOKEN = "test-user-access-token";
const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";

function request(path, { token = TOKEN, origin = "" } = {}) {
  const headers = new Headers();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (origin) headers.set("Origin", origin);
  return new Request("https://system-hub.test" + path, { method: "GET", headers });
}

function authResponse(status = 200, body = { id: "owner-user-id" }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("data source catalog rejects requests without a bearer token before provider access", async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    throw new Error("provider access must not occur");
  });

  const response = await worker.fetch(request("/v1/data/sources", { token: "" }), ENV);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "authentication_required");
  assert.equal(fetchCalls, 0);
});

test("data source catalog rejects an invalid Supabase session", async (t) => {
  let authCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    authCalls += 1;
    assert.equal(new URL(url).pathname, "/auth/v1/user");
    assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
    return authResponse(401, { message: "invalid token" });
  });

  const response = await worker.fetch(request("/v1/data/sources"), ENV);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "invalid_or_expired_session");
  assert.equal(authCalls, 1);
});

test("authenticated user can read the catalog without reachability claims or secrets", async (t) => {
  let authCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    authCalls += 1;
    assert.equal(new URL(url).origin, ENV.SUPABASE_URL);
    assert.equal(new URL(url).pathname, "/auth/v1/user");
    assert.equal(init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
    return authResponse();
  });

  const response = await worker.fetch(request("/v1/data/sources"), ENV);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.catalogVersion, "1.0.0");
  assert.equal(body.semantics.listed, "registered_source_path_only");
  assert.equal(body.semantics.reachability, "not_implied");
  assert.equal(body.semantics.dataVerification, "must_be_checked_per_resource_and_connection");
  assert.equal(body.mode, "read-only");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.ok(body.sources.some((source) => source.id === "supabase-postgrest"));
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal(JSON.stringify(body).includes(ENV.SUPABASE_PUBLISHABLE_KEY), false);
  assert.equal(authCalls, 1);
});

test("connection lookup is constrained to the authenticated user and hides another tenant's record", async (t) => {
  let authCalls = 0;
  let postgrestCalls = 0;

  t.mock.method(globalThis, "fetch", async (url, init) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") {
      authCalls += 1;
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      return authResponse(200, { id: "owner-user-id" });
    }

    if (parsed.pathname === "/rest/v1/broker_connections") {
      postgrestCalls += 1;
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      assert.equal(init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(parsed.searchParams.get("user_id"), "eq.owner-user-id");
      assert.equal(parsed.searchParams.get("id"), "eq." + CONNECTION_ID);
      // Simulate RLS returning no rows for a connection owned by a different user.
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error("unexpected upstream request: " + parsed.pathname);
  });

  const response = await worker.fetch(
    request("/v1/connections/" + CONNECTION_ID + "/status"),
    ENV
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "connection_not_found");
  assert.equal(authCalls, 1);
  assert.equal(postgrestCalls, 1);
});

test("catalog route remains read-only and does not accept non-GET methods", async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return authResponse();
  });

  const response = await worker.fetch(new Request("https://system-hub.test/v1/data/sources", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN }
  }), ENV);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "not_found");
  assert.equal(fetchCalls, 0);
});
