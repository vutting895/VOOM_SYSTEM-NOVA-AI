import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.NOVA_LOCAL_SUPABASE_URL;
const anonKey = process.env.NOVA_LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.NOVA_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NOVA_LOCAL_APP_URL || "http://127.0.0.1:3100";

for (const [name, value] of Object.entries({ apiUrl, anonKey, serviceRoleKey })) {
  assert.ok(value, `Missing required local test setting: ${name}`);
}
assert.match(apiUrl, /^http:\/\/127\.0\.0\.1:/, "Tests must use the isolated local Supabase API");

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }
  }
  return { response, body };
}

async function createLocalUser(email, password) {
  const created = await requestJson(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.response.status, 200, `Local Auth admin user creation failed: ${JSON.stringify(created.body)}`);
  const userId = created.body?.id;
  assert.ok(userId, "Local Auth did not return a created user id");

  const signedIn = await requestJson(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signedIn.response.status, 200, `Local Auth password sign-in failed: ${JSON.stringify(signedIn.body)}`);
  assert.equal(signedIn.body?.user?.id, userId, "Password sign-in returned a different user");
  assert.ok(signedIn.body?.access_token, "Local Auth did not issue a user access token");
  return { id: userId, token: signedIn.body.access_token };
}

function bearer(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  };
}

async function appRequest(path, token, method = "GET", payload) {
  const headers = token ? bearer(token) : {};
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  const { response, body } = await requestJson(`${appUrl}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return { status: response.status, body };
}

async function restRequest(path, token, method = "GET", payload) {
  const headers = bearer(token);
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const { response, body } = await requestJson(`${apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return { status: response.status, body };
}

const suffix = randomUUID();
const password = `NOVA-local-${randomUUID()}-Aa9!`;
const emailA = `nova-owner-a-${suffix}@example.test`;
const emailB = `nova-owner-b-${suffix}@example.test`;
let userA;
let userB;

try {
  userA = await createLocalUser(emailA, password);
  userB = await createLocalUser(emailB, password);

  const unauthenticated = await appRequest("/api/agent/threads", null);
  assert.equal(unauthenticated.status, 401, "Unauthenticated API request must be rejected");

  const createdThread = await appRequest("/api/agent/threads", userA.token, "POST", {
    title: "Local Supabase Auth isolation test",
  });
  assert.equal(createdThread.status, 201, `Owner A could not create a thread: ${JSON.stringify(createdThread.body)}`);
  const threadId = createdThread.body?.thread?.id;
  assert.ok(threadId, "Thread creation returned no id");
  assert.equal(createdThread.body?.executionEnabled, false);
  assert.equal(createdThread.body?.liveTradingEnabled, false);

  const ownerAThreads = await appRequest("/api/agent/threads", userA.token);
  assert.equal(ownerAThreads.status, 200);
  assert.ok(ownerAThreads.body.threads.some((thread) => thread.id === threadId));

  const ownerBThreads = await appRequest("/api/agent/threads", userB.token);
  assert.equal(ownerBThreads.status, 200);
  assert.ok(!ownerBThreads.body.threads.some((thread) => thread.id === threadId), "User B must not list User A's thread");

  const proposal = {
    title: "Exness Demo research-only setup",
    summary: "A strategy draft for review only; no order or account action.",
    market: "XAU/USD",
    timeframe: "1h",
    riskProfile: "low",
  };

  const foreignCreate = await appRequest(
    `/api/agent/threads/${threadId}/approvals`,
    userB.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(foreignCreate.status, 409, "User B must not create an approval in User A's thread");
  assert.equal(foreignCreate.body?.error, "thread_not_found_or_not_active");

  const createdApproval = await appRequest(
    `/api/agent/threads/${threadId}/approvals`,
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(createdApproval.status, 201, `Owner A could not create approval: ${JSON.stringify(createdApproval.body)}`);
  const approvalId = createdApproval.body?.approval?.id;
  assert.ok(approvalId, "Approval creation returned no id");

  const ownerAApprovals = await appRequest(`/api/agent/threads/${threadId}/approvals`, userA.token);
  assert.equal(ownerAApprovals.status, 200);
  assert.ok(ownerAApprovals.body.approvals.some((approval) => approval.id === approvalId));

  const foreignApprovalList = await appRequest(`/api/agent/threads/${threadId}/approvals`, userB.token);
  assert.equal(foreignApprovalList.status, 404, "User B must not read User A's thread approval list");

  const foreignDecision = await appRequest(
    `/api/agent/approvals/${approvalId}/decision`,
    userB.token,
    "POST",
    { decision: "approve", note: "Must be rejected for a foreign owner" },
  );
  assert.equal(foreignDecision.status, 404, "User B must not resolve User A's approval");
  assert.equal(foreignDecision.body?.error, "approval_not_found");

  const ownerDecision = await appRequest(
    `/api/agent/approvals/${approvalId}/decision`,
    userA.token,
    "POST",
    { decision: "approve", note: "Local owner-session integration test" },
  );
  assert.equal(ownerDecision.status, 200, `Owner A could not resolve approval: ${JSON.stringify(ownerDecision.body)}`);
  assert.equal(ownerDecision.body?.approval?.status, "approved");
  assert.equal(ownerDecision.body?.executionEnabled, false);
  assert.equal(ownerDecision.body?.liveTradingEnabled, false);
  assert.equal(ownerDecision.body?.brokerMutationEnabled, false);

  const replay = await appRequest(
    `/api/agent/approvals/${approvalId}/decision`,
    userA.token,
    "POST",
    { decision: "approve" },
  );
  assert.equal(replay.status, 409, "A resolved approval must reject a replay");
  assert.equal(replay.body?.error, "approval_already_resolved");

  const editedProposal = {
    ...proposal,
    title: "Edited Exness Demo research draft",
    summary: "Edited and saved for a fresh review; still no order or account action.",
  };

  const secondApprovalResponse = await appRequest(
    `/api/agent/threads/${threadId}/approvals`,
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(secondApprovalResponse.status, 201, `Owner A could not create the edit-test approval: ${JSON.stringify(secondApprovalResponse.body)}`);
  const secondApprovalId = secondApprovalResponse.body?.approval?.id;
  assert.ok(secondApprovalId, "Edit-test approval creation returned no id");

  const editDecision = await appRequest(
    `/api/agent/approvals/${secondApprovalId}/decision`,
    userA.token,
    "POST",
    { decision: "edit", note: "Revise and submit for a fresh review", editedProposal },
  );
  assert.equal(editDecision.status, 200, `Owner A could not save an edited draft: ${JSON.stringify(editDecision.body)}`);
  assert.equal(editDecision.body?.approval?.status, "edited");
  assert.equal(editDecision.body?.approval?.decision_payload?.summary, editedProposal.summary);
  assert.equal(editDecision.body?.executionEnabled, false);
  assert.equal(editDecision.body?.liveTradingEnabled, false);
  assert.equal(editDecision.body?.brokerMutationEnabled, false);

  // A fresh GET is the refresh/recovery check: the edited state must be restored from Postgres.
  const restoredAfterEdit = await appRequest(`/api/agent/threads/${threadId}/approvals`, userA.token);
  assert.equal(restoredAfterEdit.status, 200);
  const restoredEditedApproval = restoredAfterEdit.body.approvals.find((item) => item.id === secondApprovalId);
  assert.equal(restoredEditedApproval?.status, "edited");
  assert.equal(restoredEditedApproval?.decision_payload?.summary, editedProposal.summary);

  const thirdApprovalResponse = await appRequest(
    `/api/agent/threads/${threadId}/approvals`,
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(thirdApprovalResponse.status, 201, `Owner A could not create the reject-test approval: ${JSON.stringify(thirdApprovalResponse.body)}`);
  const thirdApprovalId = thirdApprovalResponse.body?.approval?.id;
  assert.ok(thirdApprovalId, "Reject-test approval creation returned no id");

  const rejectDecision = await appRequest(
    `/api/agent/approvals/${thirdApprovalId}/decision`,
    userA.token,
    "POST",
    { decision: "reject", note: "Not approved for this research iteration" },
  );
  assert.equal(rejectDecision.status, 200, `Owner A could not reject the draft: ${JSON.stringify(rejectDecision.body)}`);
  assert.equal(rejectDecision.body?.approval?.status, "rejected");
  assert.equal(rejectDecision.body?.approval?.decision_payload, null);
  assert.equal(rejectDecision.body?.executionEnabled, false);
  assert.equal(rejectDecision.body?.liveTradingEnabled, false);
  assert.equal(rejectDecision.body?.brokerMutationEnabled, false);

  const restoredAfterReject = await appRequest(`/api/agent/threads/${threadId}/approvals`, userA.token);
  assert.equal(restoredAfterReject.status, 200);
  assert.equal(restoredAfterReject.body.approvals.find((item) => item.id === thirdApprovalId)?.status, "rejected");

  const connectionCreated = await restRequest("broker_connections?select=id,user_id,status", userA.token, "POST", {
    account_label: "Exness MT5 Demo",
  });
  assert.equal(connectionCreated.status, 201, `Owner A could not create a pending Demo connection: ${JSON.stringify(connectionCreated.body)}`);
  const connection = Array.isArray(connectionCreated.body) ? connectionCreated.body[0] : connectionCreated.body;
  assert.ok(connection?.id, "Pending broker connection returned no id");
  assert.equal(connection.status, "pending");

  const ownerAConnection = await restRequest(
    `broker_connections?select=id&id=eq.${encodeURIComponent(connection.id)}`,
    userA.token,
  );
  assert.equal(ownerAConnection.status, 200);
  assert.equal(ownerAConnection.body.length, 1, "Owner A must read their own Demo connection");

  const ownerBConnection = await restRequest(
    `broker_connections?select=id&id=eq.${encodeURIComponent(connection.id)}`,
    userB.token,
  );
  assert.equal(ownerBConnection.status, 200);
  assert.equal(ownerBConnection.body.length, 0, "User B must not read User A's Demo connection");

  console.log("PASS: real local Supabase Auth users/JWTs; owner-scoped thread and approval APIs; foreign-user create/read/decision denied; approval replay rejected; Exness Demo connection RLS isolates owners.");
  console.log("SAFETY: this test used only local containers; no hosted Supabase, production secrets, MT5 terminal, Relay, broker order, or account mutation was contacted.");
} finally {
  for (const user of [userA, userB]) {
    if (!user?.id) continue;
    await requestJson(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }).catch(() => {});
  }
}
