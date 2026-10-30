import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const base = process.env.NOVA_STAGING_SUPABASE_URL || "";
const publishableKey = process.env.NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY || "";
const serviceRoleKey = process.env.NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY || "";
const appUrl = (process.env.NOVA_STAGING_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
// Optional short-lived CAPTCHA token for staging sign-in; never log or persist it.
const captchaToken = process.env.NOVA_STAGING_CAPTCHA_TOKEN || "";
const expectedBase = "https://rovhmjeowracayicbqij.supabase.co";

for (const [name, value] of [
  ["NOVA_STAGING_SUPABASE_URL", base],
  ["NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY", publishableKey],
  ["NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
]) {
  if (!value) throw new Error("Missing staging-only environment value: " + name);
}
if (base !== expectedBase) throw new Error("Refusing to run customer-isolation tests outside the approved staging Supabase project.");

function decodeLegacyJwt(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}

if (publishableKey.startsWith("sb_secret_")) {
  throw new Error("NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY is a secret key, not a publishable key. Use the staging project's publishable/anon key.");
}
if (publishableKey.startsWith("sb_publishable_")) {
  // New-format publishable keys are non-JWT; the staging Auth settings request below verifies project binding.
} else {
  const publishableClaims = decodeLegacyJwt(publishableKey);
  if (publishableClaims?.role !== "anon" || publishableClaims?.ref !== "rovhmjeowracayicbqij") {
    throw new Error("NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY must be the staging project's anon JWT or sb_publishable key. No value is printed.");
  }
}
const serviceClaims = decodeLegacyJwt(serviceRoleKey);
if (serviceRoleKey === publishableKey || serviceClaims?.role !== "service_role" || serviceClaims?.ref !== "rovhmjeowracayicbqij") {
  throw new Error("NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY must be the staging project's legacy service_role JWT. The current key is missing, mismatched, or not an admin JWT; values are never printed.");
}

const users = [];
const checks = [];
let primaryError = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headers(apiKey, bearer, extra = {}) {
  return {
    apikey: apiKey,
    ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
    ...extra,
  };
}

async function anyJsonRequest(url, init) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  return { response, payload };
}

async function jsonRequest(url, init, label) {
  const result = await anyJsonRequest(url, init);
  if (!result.response.ok) {
    throw new Error(label + " failed (HTTP " + result.response.status + "). Response body suppressed.");
  }
  return result;
}

async function adminRequest(path, method, body, label) {
  return jsonRequest(base + path, {
    method,
    headers: headers(serviceRoleKey, serviceRoleKey, {
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, label);
}

async function apiRequest(path, token, method = "GET", body = undefined, label = path) {
  return anyJsonRequest(appUrl + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, label);
}

async function restRequest(path, token, method = "GET", body = undefined, label = path) {
  return jsonRequest(base + "/rest/v1/" + path, {
    method,
    headers: headers(publishableKey, token, {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "POST" ? { Prefer: "return=representation" } : {}),
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, label);
}

async function createTestUser(label) {
  const suffix = randomUUID().replaceAll("-", "");
  const email = "nova-pr85-" + label + "-" + suffix + "@example.com";
  const password = randomBytes(32).toString("base64url") + "A9!";
  const { payload } = await adminRequest("/auth/v1/admin/users", "POST", {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      purpose: "system_test_only",
      note: "บัญชีนี้ใช้ในการทดสอบระบบเท่านั้น ไม่ใช่บัญชีผู้ใช้งานจริง",
    },
  }, "Create temporary staging user");
  const id = payload?.user?.id || payload?.id;
  assert.ok(typeof id === "string" && id.length > 0, "Auth Admin did not return a user id");
  const user = { id, email, password, token: "" };
  users.push(user);

  const signedIn = await jsonRequest(base + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(publishableKey, "", {
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ email, password, ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}) }),
  }, "Sign in temporary staging user");
  assert.ok(typeof signedIn.payload?.access_token === "string", "Password sign-in did not return an access token");
  assert.equal(signedIn.payload?.user?.id, id, "Signed-in identity does not match created test user");
  user.token = signedIn.payload.access_token;
  return user;
}

async function waitForApp() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(appUrl + "/login", { cache: "no-store" });
      if (response.status === 200) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("Staging-configured Next.js preview did not become ready.");
}

async function check(label, callback) {
  await callback();
  checks.push(label);
}

async function runTests() {
  await waitForApp();
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");

  const brokerA = await apiRequest("/api/broker/status?broker=mt5", userA.token, "POST", {}, "Create Customer A Demo request");
  const brokerB = await apiRequest("/api/broker/status?broker=mt5", userB.token, "POST", {}, "Create Customer B Demo request");
  assert.equal(brokerA.response.status, 202);
  assert.equal(brokerB.response.status, 202);
  const connectionA = brokerA.payload?.connectionRequestId;
  const connectionB = brokerB.payload?.connectionRequestId;
  assert.ok(connectionA && connectionB && connectionA !== connectionB, "Customer broker requests were not isolated");

  await check("Broker API returns each customer's own pending Exness Demo connection", async () => {
    const a = await apiRequest("/api/broker/status?broker=mt5", userA.token);
    const b = await apiRequest("/api/broker/status?broker=mt5", userB.token);
    assert.equal(a.payload?.connectionRequestId, connectionA);
    assert.equal(b.payload?.connectionRequestId, connectionB);
    assert.notEqual(a.payload?.connectionRequestId, b.payload?.connectionRequestId);
    assert.equal(a.payload?.ordersEnabled, false);
    assert.equal(b.payload?.ordersEnabled, false);
  });

  await check("Broker table RLS denies Customer B reading Customer A connection", async () => {
    const own = await restRequest("broker_connections?id=eq." + connectionA + "&select=id,user_id", userA.token);
    const foreign = await restRequest("broker_connections?id=eq." + connectionA + "&select=id,user_id", userB.token);
    assert.equal(own.payload?.length, 1);
    assert.equal(own.payload[0].user_id, userA.id);
    assert.deepEqual(foreign.payload, []);
  });

  await check("Broker table RLS rejects Customer B inserting a connection for Customer A", async () => {
    const response = await fetch(base + "/rest/v1/broker_connections", {
      method: "POST",
      headers: headers(publishableKey, userB.token, {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify({
        user_id: userA.id,
        provider: "exness_mt5",
        environment: "demo",
        status: "pending",
        account_label: "System Test Only",
      }),
    });
    assert.ok(response.status >= 400, "Foreign-owner broker insert unexpectedly succeeded");
  });

  const threadAResponse = await apiRequest("/api/agent/threads", userA.token, "POST", {
    title: "PR85 staging Customer A isolation test",
  }, "Create Customer A thread");
  const threadBResponse = await apiRequest("/api/agent/threads", userB.token, "POST", {
    title: "PR85 staging Customer B isolation test",
  }, "Create Customer B thread");
  assert.equal(threadAResponse.response.status, 201);
  assert.equal(threadBResponse.response.status, 201);
  const threadA = threadAResponse.payload?.thread?.id;
  const threadB = threadBResponse.payload?.thread?.id;
  assert.ok(threadA && threadB && threadA !== threadB);

  await check("Threads API and RLS expose only the authenticated customer's threads", async () => {
    const a = await apiRequest("/api/agent/threads", userA.token);
    const b = await apiRequest("/api/agent/threads", userB.token);
    assert.ok(a.payload?.threads?.some((item) => item.id === threadA));
    assert.ok(!b.payload?.threads?.some((item) => item.id === threadA));
    const directForeign = await restRequest("nova_agent_threads?id=eq." + threadA + "&select=id,user_id", userB.token);
    assert.deepEqual(directForeign.payload, []);
  });

  const proposal = {
    title: "NOVA staging isolation draft",
    summary: "System-test-only research draft; no broker or order action.",
    market: "XAU/USD",
    timeframe: "15m",
    riskProfile: "low",
  };
  const foreignCreate = await apiRequest(
    "/api/agent/threads/" + encodeURIComponent(threadA) + "/approvals",
    userB.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
    "Attempt foreign approval creation",
  );
  assert.equal(foreignCreate.response.status, 409);
  assert.equal(foreignCreate.payload?.error, "thread_not_found_or_not_active");

  const approvalResponse = await apiRequest(
    "/api/agent/threads/" + encodeURIComponent(threadA) + "/approvals",
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
    "Create Customer A approval",
  );
  assert.equal(approvalResponse.response.status, 201);
  const approvalId = approvalResponse.payload?.approval?.id;
  assert.ok(approvalId);

  await check("Approval reads and decision endpoints reject cross-customer access", async () => {
    const own = await apiRequest("/api/agent/threads/" + threadA + "/approvals", userA.token);
    assert.ok(own.payload?.approvals?.some((item) => item.id === approvalId));
    const foreignList = await apiRequest("/api/agent/threads/" + threadA + "/approvals", userB.token);
    assert.equal(foreignList.response.status, 404);
    assert.equal(foreignList.payload?.error, "thread_not_found");

    const foreignDecision = await apiRequest(
      "/api/agent/approvals/" + approvalId + "/decision",
      userB.token,
      "POST",
      { decision: "approve" },
      "Attempt foreign approval decision",
    );
    assert.equal(foreignDecision.response.status, 404);
    assert.equal(foreignDecision.payload?.error, "approval_not_found");

    const directForeign = await restRequest("nova_approval_requests?id=eq." + approvalId + "&select=id,user_id", userB.token);
    assert.deepEqual(directForeign.payload, []);
  });

  await check("Approval decision is one-time and does not enable execution", async () => {
    const ownDecision = await apiRequest(
      "/api/agent/approvals/" + approvalId + "/decision",
      userA.token,
      "POST",
      { decision: "approve" },
      "Approve Customer A research draft",
    );
    assert.equal(ownDecision.response.status, 200);
    assert.equal(ownDecision.payload?.approval?.status, "approved");
    assert.equal(ownDecision.payload?.executionEnabled, false);
    assert.equal(ownDecision.payload?.liveTradingEnabled, false);
    const replay = await apiRequest(
      "/api/agent/approvals/" + approvalId + "/decision",
      userA.token,
      "POST",
      { decision: "approve" },
      "Replay Customer A approval",
    );
    assert.equal(replay.response.status, 409);
    assert.equal(replay.payload?.error, "approval_already_resolved");
  });

  console.log("STAGING CUSTOMER ISOLATION: " + checks.length + " checks passed.");
  console.log("Verified: Exness Demo broker ownership, thread ownership, approval ownership, cross-user denial, one-time decision, execution disabled.");
}

async function cleanup() {
  const failures = [];
  for (const user of [...users].reverse()) {
    if (user.token) {
      try {
        await fetch(base + "/auth/v1/logout", {
          method: "POST",
          headers: headers(publishableKey, user.token),
          cache: "no-store",
        });
      } catch {}
    }
    try {
      await adminRequest("/auth/v1/admin/users/" + encodeURIComponent(user.id), "DELETE", undefined, "Delete temporary staging user");
      const deleted = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
        headers: headers(serviceRoleKey, serviceRoleKey, { Accept: "application/json" }),
        cache: "no-store",
      });
      if (deleted.status !== 404) failures.push("Auth user deletion could not be verified");
    } catch {
      failures.push("Temporary staging user cleanup failed");
    }
    for (const table of ["broker_connections", "nova_agent_threads", "nova_approval_requests"]) {
      try {
        const response = await fetch(base + "/rest/v1/" + table + "?user_id=eq." + encodeURIComponent(user.id) + "&select=id", {
          headers: headers(serviceRoleKey, serviceRoleKey, { Accept: "application/json" }),
          cache: "no-store",
        });
        const rows = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(rows) || rows.length !== 0) {
          failures.push("Temporary staging data cleanup could not be verified");
        }
      } catch {
        failures.push("Temporary staging data cleanup could not be verified");
      }
    }
  }
  return failures;
}

try {
  await runTests();
} catch (error) {
  primaryError = error;
} finally {
  const cleanupFailures = await cleanup();
  if (cleanupFailures.length) {
    console.error("STAGING CLEANUP FAILURE: temporary test users or rows may remain. Inspect staging Auth and the three test tables.");
    primaryError = primaryError || new Error(cleanupFailures[0]);
  } else {
    console.log("STAGING CLEANUP: " + users.length + " temporary test user(s) were signed out, deleted, and verified absent; owned test rows are zero.");
  }
}
if (primaryError) throw primaryError;
