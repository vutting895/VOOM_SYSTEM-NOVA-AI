import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import worker from "../worker.js";

const supabaseUrl = process.env.NOVA_LOCAL_SUPABASE_URL || "";
const publishableKey = process.env.NOVA_LOCAL_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.NOVA_LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const origin = "https://nova-local-test.invalid";

for (const [name, value] of Object.entries({
  NOVA_LOCAL_SUPABASE_URL: supabaseUrl,
  NOVA_LOCAL_SUPABASE_ANON_KEY: publishableKey,
  NOVA_LOCAL_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
})) {
  assert.ok(value, `Missing local-only setting: ${name}`);
}
assert.match(
  supabaseUrl,
  /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/,
  "System Hub integration tests must use the disposable local Supabase stack",
);
assert.notEqual(publishableKey, serviceRoleKey, "Local publishable and service-role keys must be distinct");

const env = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  ALLOWED_ORIGINS: origin,
  MT5_READONLY_PROXY_URL: "https://voom-mt5-readonly-proxy.suwapat787.workers.dev",
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body };
}

function adminHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function userHeaders(token, extra = {}) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function createUser(label) {
  const suffix = randomUUID().replaceAll("-", "");
  const email = `nova-hub-${label}-${suffix}@example.test`;
  const password = `NOVA-local-${randomBytes(24).toString("base64url")}-Aa9!`;

  const created = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.ok(
    created.response.ok,
    `Local Auth could not create test user ${label} (HTTP ${created.response.status})`,
  );
  const id = created.body?.user?.id || created.body?.id;
  assert.ok(typeof id === "string" && id.length > 0, "Local Auth did not return a user id");

  // Register the user for cleanup immediately after Auth creation, before sign-in can fail.
  const user = { id, email, password, token: "" };
  users.push(user);

  const signedIn = await requestJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  assert.equal(signedIn.response.status, 200, "Local Auth password sign-in failed");
  assert.equal(signedIn.body?.user?.id, id, "Issued session identity differs from created user");
  assert.ok(typeof signedIn.body?.access_token === "string", "Local Auth did not issue a JWT");
  user.token = signedIn.body.access_token;
  return user;
}

async function hubRequest(path, token, method = "GET", payload = undefined) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request(`https://hub.local${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const response = await worker.fetch(request, env);
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body, raw };
}

async function restRequest(path, token, method = "GET", payload = undefined) {
  const headers = userHeaders(token, {
    Accept: "application/json",
    ...(payload === undefined ? {} : {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
  });
  return requestJson(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

async function deleteUser(user) {
  if (!user?.id) return;
  if (user.token) {
    await requestJson(`${supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: userHeaders(user.token),
    }).catch(() => {});
  }
  const deleted = await requestJson(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    { method: "DELETE", headers: adminHeaders() },
  );
  assert.ok(
    deleted.response.ok || deleted.response.status === 404,
    "Temporary local Auth user cleanup failed",
  );
  const verification = await requestJson(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    { headers: adminHeaders() },
  );
  assert.equal(verification.response.status, 404, "Temporary local Auth user remains after cleanup");
  const remaining = await requestJson(
    `${supabaseUrl}/rest/v1/broker_connections?select=id&user_id=eq.${encodeURIComponent(user.id)}`,
    { headers: adminHeaders({ Accept: "application/json" }) },
  );
  assert.ok(remaining.response.ok, "Could not verify local broker-row cleanup");
  assert.deepEqual(remaining.body, [], "Temporary broker rows remain after Auth user deletion");
}

const users = [];
let primaryError = null;

try {
  const userA = await createUser("a");
  const userB = await createUser("b");

  const health = await hubRequest("/health", null);
  assert.equal(health.response.status, 200);
  assert.equal(health.body?.ordersEnabled, false);
  assert.equal(health.body?.executionEnabled, false);
  assert.equal(health.body?.liveTradingEnabled, false);

  const unauthenticated = await hubRequest("/v1/connections", null);
  assert.equal(unauthenticated.response.status, 401, "Unauthenticated connection list must be denied");

  const integrations = await hubRequest("/v1/integrations", userA.token);
  assert.equal(integrations.response.status, 200, "Authenticated integration registry read failed");
  assert.equal(integrations.body?.ordersEnabled, false);
  assert.equal(integrations.body?.liveTradingEnabled, false);

  const attackerInput = {
    user_id: userB.id,
    tenant_id: userB.id,
    provider: "unapproved-provider",
    environment: "live",
    status: "connected",
    bridge_route_id: "attacker-route",
    password: "synthetic-not-a-real-secret",
    upstream_url: "https://attacker.invalid",
  };
  const createdA = await hubRequest("/v1/connections", userA.token, "POST", attackerInput);
  const createdB = await hubRequest("/v1/connections", userB.token, "POST", attackerInput);
  assert.equal(createdA.response.status, 201, "Owner A pending Demo request was not created");
  assert.equal(createdB.response.status, 201, "Owner B pending Demo request was not created");

  const connectionA = createdA.body?.connection?.connectionId;
  const connectionB = createdB.body?.connection?.connectionId;
  assert.ok(connectionA && connectionB && connectionA !== connectionB, "Users did not receive distinct connection IDs");
  for (const created of [createdA, createdB]) {
    assert.equal(created.body?.created, true);
    assert.equal(created.body?.connection?.provider, "exness_mt5");
    assert.equal(created.body?.connection?.environment, "demo");
    assert.equal(created.body?.connection?.recordStatus, "pending");
    assert.equal(created.body?.connection?.readiness, "pending_provisioning");
    assert.equal(created.body?.ordersEnabled, false);
    assert.equal(created.body?.liveTradingEnabled, false);
    assert.doesNotMatch(created.raw, /attacker-route|synthetic-not-a-real-secret|upstream_url|tenant_id/);
  }

  const listA = await hubRequest("/v1/connections", userA.token);
  const listB = await hubRequest("/v1/connections", userB.token);
  assert.equal(listA.response.status, 200);
  assert.equal(listB.response.status, 200);
  assert.ok(listA.body?.connections?.some((row) => row.connectionId === connectionA));
  assert.ok(!listA.body?.connections?.some((row) => row.connectionId === connectionB));
  assert.ok(listB.body?.connections?.some((row) => row.connectionId === connectionB));
  assert.ok(!listB.body?.connections?.some((row) => row.connectionId === connectionA));

  const ownStatus = await hubRequest(`/v1/connections/${connectionA}/status`, userA.token);
  assert.equal(ownStatus.response.status, 200);
  assert.equal(ownStatus.body?.connectionId, connectionA);
  assert.equal(ownStatus.body?.dataVerified, false);

  const foreignStatus = await hubRequest(`/v1/connections/${connectionA}/status`, userB.token);
  assert.equal(foreignStatus.response.status, 404, "Owner B must not resolve Owner A connection");

  const foreignAccount = await hubRequest(`/v1/connections/${connectionA}/account`, userB.token);
  assert.equal(foreignAccount.response.status, 404, "Owner B must not read Owner A account");
  const pendingAccount = await hubRequest(`/v1/connections/${connectionA}/account`, userA.token);
  assert.equal(pendingAccount.response.status, 409, "Pending Demo connection must not reach MT5 Proxy");
  assert.equal(pendingAccount.body?.state, "pending_provisioning");

  const pendingCheck = await hubRequest(`/v1/connections/${connectionA}/check`, userA.token, "POST", {});
  assert.equal(pendingCheck.response.status, 409, "Pending Demo check must not reach MT5 Proxy");
  assert.equal(pendingCheck.body?.state, "pending_provisioning");

  const ownDirect = await restRequest(
    `broker_connections?id=eq.${encodeURIComponent(connectionA)}&select=id,user_id`,
    userA.token,
  );
  const foreignDirect = await restRequest(
    `broker_connections?id=eq.${encodeURIComponent(connectionA)}&select=id,user_id`,
    userB.token,
  );
  assert.equal(ownDirect.response.status, 200);
  assert.equal(ownDirect.body?.length, 1);
  assert.equal(ownDirect.body[0]?.user_id, userA.id);
  assert.equal(foreignDirect.response.status, 200);
  assert.deepEqual(foreignDirect.body, [], "PostgREST RLS must hide Owner A row from Owner B");

  const foreignInsert = await restRequest("broker_connections", userB.token, "POST", {
    user_id: userA.id,
    provider: "exness_mt5",
    environment: "demo",
    status: "pending",
    account_label: "System Test Only",
    bridge_route_id: null,
  });
  assert.ok(foreignInsert.response.status >= 400, "PostgREST RLS must reject a foreign-owner insert");

  const unauthorizedUpdate = await restRequest(
    `broker_connections?id=eq.${encodeURIComponent(connectionA)}`,
    userA.token,
    "PATCH",
    { status: "connected", bridge_route_id: "forbidden-route-id" },
  );
  assert.ok(unauthorizedUpdate.response.status >= 400, "Authenticated user must not mutate status or bridge route");

  console.log("PASS: live local Supabase Auth JWTs + System Hub Core + PostgREST; two-user isolation, foreign-owner denial, and pending-only Demo guard.");
  console.log("SAFETY: disposable local Supabase only; no hosted project, customer data, MT5 terminal, Relay, broker order, or account mutation was contacted.");
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  for (const user of [...users].reverse()) {
    try {
      await deleteUser(user);
    } catch {
      cleanupErrors.push("Temporary local Auth user or broker-row cleanup failed");
    }
  }
  if (cleanupErrors.length) {
    primaryError = primaryError || new Error(cleanupErrors[0]);
    console.error("LOCAL SYSTEM HUB CLEANUP: failed to verify one or more temporary test users or rows.");
  } else {
    console.log(`LOCAL SYSTEM HUB CLEANUP: ${users.length} temporary users signed out, deleted, and verified absent.`);
  }
}
if (primaryError) throw primaryError;
