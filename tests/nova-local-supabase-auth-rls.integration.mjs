import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.NOVA_LOCAL_SUPABASE_URL;
const anonKey = process.env.NOVA_LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.NOVA_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries({ apiUrl, anonKey, serviceRoleKey })) {
  assert.ok(value, "Missing local Supabase setting: " + name);
}
assert.match(apiUrl, /^http:\/\/127\.0\.0\.1:/, "Tests must use the ephemeral local stack");

async function request(url, options = {}) {
  const key = options.admin ? serviceRoleKey : anonKey;
  const headers = { apikey: key, Accept: "application/json" };
  if (options.token) headers.Authorization = "Bearer " + options.token;
  else if (options.admin) headers.Authorization = "Bearer " + serviceRoleKey;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
  }
  return { status: response.status, body: parsed };
}
async function createUser(label) {
  const suffix = randomUUID();
  const email = "nova-local-" + label + "-" + suffix + "@example.test";
  const password = "Local-NOVA-" + randomUUID() + "-Aa9!";
  const created = await request(apiUrl + "/auth/v1/admin/users", {
    method: "POST", admin: true, body: { email, password, email_confirm: true },
  });
  assert.equal(created.status, 200, "Local Auth user creation failed: " + JSON.stringify(created.body));
  const id = created.body && created.body.id;
  assert.ok(id, "Local Auth returned no user id");
  const login = await request(apiUrl + "/auth/v1/token?grant_type=password", {
    method: "POST", body: { email, password },
  });
  assert.equal(login.status, 200, "Local Auth password sign-in failed: " + JSON.stringify(login.body));
  assert.equal(login.body && login.body.user && login.body.user.id, id);
  assert.ok(login.body && login.body.access_token);
  return { id, token: login.body.access_token };
}
async function rest(path, user, method = "GET", body) {
  return request(apiUrl + "/rest/v1/" + path, { token: user && user.token, method, body });
}
async function rpc(name, user, body) {
  return request(apiUrl + "/rest/v1/rpc/" + name, { token: user.token, method: "POST", body });
}
function firstRow(body) { return Array.isArray(body) ? body[0] : body; }

let ownerA;
let ownerB;
try {
  ownerA = await createUser("owner-a");
  ownerB = await createUser("owner-b");

  const anonymousRead = await request(apiUrl + "/rest/v1/nova_agent_threads?select=id");
  assert.ok(anonymousRead.status >= 400, "Anonymous table read must be denied");

  const threadCreate = await rest("nova_agent_threads?select=id,user_id,state", ownerA, "POST", {
    title: "Local Supabase owner isolation test",
  });
  assert.equal(threadCreate.status, 201, "Owner A thread insert failed: " + JSON.stringify(threadCreate.body));
  const thread = firstRow(threadCreate.body);
  assert.ok(thread && thread.id);
  assert.equal(thread.user_id, ownerA.id);
  assert.equal(thread.state, "active");

  const ownerAThreads = await rest("nova_agent_threads?select=id&id=eq." + thread.id, ownerA);
  assert.equal(ownerAThreads.status, 200);
  assert.equal(ownerAThreads.body.length, 1);
  const ownerBThreads = await rest("nova_agent_threads?select=id&id=eq." + thread.id, ownerB);
  assert.equal(ownerBThreads.status, 200);
  assert.equal(ownerBThreads.body.length, 0, "Foreign owner must not read another user's thread");

  const proposal = {
    title: "NOVA local research-only proposal",
    summary: "Supabase local RLS integration check; no broker action.",
    market: "XAU/USD", timeframe: "1h", riskProfile: "low",
  };
  const createApprovalArgs = {
    p_thread_id: thread.id,
    p_request_type: "strategy_draft_review",
    p_proposal: proposal,
    p_proposal_hash: "a".repeat(64),
    p_policy_version: "nova-approval.v1",
    p_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  const foreignCreate = await rpc("nova_create_approval", ownerB, createApprovalArgs);
  assert.ok(foreignCreate.status >= 400, "Foreign user must not create an approval in another owner's thread");

  const created = await rpc("nova_create_approval", ownerA, createApprovalArgs);
  assert.equal(created.status, 200, "Owner approval RPC failed: " + JSON.stringify(created.body));
  const approval = firstRow(created.body);
  assert.ok(approval && approval.id);
  assert.equal(approval.status, "pending");

  const ownerAApprovals = await rest("nova_approval_requests?select=id,status&id=eq." + approval.id, ownerA);
  assert.equal(ownerAApprovals.status, 200);
  assert.equal(ownerAApprovals.body.length, 1);
  const ownerBApprovals = await rest("nova_approval_requests?select=id&id=eq." + approval.id, ownerB);
  assert.equal(ownerBApprovals.status, 200);
  assert.equal(ownerBApprovals.body.length, 0, "Foreign owner must not read another user's approval");

  const foreignResolve = await rpc("nova_resolve_approval", ownerB, {
    p_approval_id: approval.id, p_decision: "approve", p_decision_note: null,
    p_decision_payload: null, p_policy_version: "nova-approval.v1",
  });
  assert.equal(foreignResolve.status, 200);
  assert.equal(firstRow(foreignResolve.body).result_code, "not_found");

  const resolveArgs = {
    p_approval_id: approval.id, p_decision: "approve",
    p_decision_note: "Local authenticated owner test",
    p_decision_payload: null, p_policy_version: "nova-approval.v1",
  };
  const resolved = await rpc("nova_resolve_approval", ownerA, resolveArgs);
  assert.equal(resolved.status, 200, "Owner resolution failed: " + JSON.stringify(resolved.body));
  assert.equal(firstRow(resolved.body).result_code, "resolved");
  assert.equal(firstRow(resolved.body).status, "approved");

  const replay = await rpc("nova_resolve_approval", ownerA, resolveArgs);
  assert.equal(replay.status, 200);
  assert.equal(firstRow(replay.body).result_code, "already_resolved");

  const connectionCreate = await rest("broker_connections?select=id,user_id,provider,environment,status", ownerA, "POST", {
    account_label: "Exness MT5 Demo local test",
  });
  assert.equal(connectionCreate.status, 201, "Owner A broker connection insert failed: " + JSON.stringify(connectionCreate.body));
  const connection = firstRow(connectionCreate.body);
  assert.equal(connection.user_id, ownerA.id);
  assert.equal(connection.provider, "exness_mt5");
  assert.equal(connection.environment, "demo");
  assert.equal(connection.status, "pending");

  const ownerBConnection = await rest("broker_connections?select=id&id=eq." + connection.id, ownerB);
  assert.equal(ownerBConnection.status, 200);
  assert.equal(ownerBConnection.body.length, 0, "Foreign owner must not read the Demo connection");

  const forgedConnection = await rest("broker_connections?select=id", ownerB, "POST", {
    user_id: ownerA.id, provider: "exness_mt5", environment: "demo",
    status: "pending", account_label: "Forged foreign owner",
  });
  assert.ok(forgedConnection.status >= 400, "RLS must reject forged user_id on broker connection insert");

  console.log("PASS: local Auth users/JWTs; owner-scoped thread and approval RPC; foreign-user denial; one-time resolution; Exness Demo connection RLS.");
  console.log("SAFETY: ephemeral local containers only; no hosted Supabase branch, Production database, MT5 terminal or broker order was contacted.");
} finally {
  for (const user of [ownerA, ownerB]) {
    if (!user || !user.id) continue;
    await request(apiUrl + "/auth/v1/admin/users/" + user.id, { method: "DELETE", admin: true }).catch(() => {});
  }
}
