import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import worker from "../worker.js";

const apiUrl = process.env.NOVA_LOCAL_SUPABASE_URL;
const publishableKey = process.env.NOVA_LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.NOVA_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const uiOrigin = "http://127.0.0.1:4173";

for (const [name, value] of Object.entries({ apiUrl, publishableKey, serviceRoleKey })) {
  assert.ok(value, "Missing local-only test setting: " + name);
}
const parsedApiUrl = new URL(apiUrl);
assert.equal(parsedApiUrl.protocol, "http:");
assert.ok(
  ["127.0.0.1", "localhost"].includes(parsedApiUrl.hostname),
  "Approval integration tests must use a disposable local Supabase stack",
);

const workerEnv = {
  SUPABASE_URL: apiUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  ALLOWED_ORIGINS: uiOrigin,
  NOVA_APPROVALS_ENABLED: "true",
};

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
  const created = await requestJson(apiUrl + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(
    created.response.status,
    200,
    "Local Auth admin user creation failed: " + JSON.stringify(created.body),
  );
  const id = created.body?.id;
  assert.ok(id, "Local Auth did not return a test user id");

  const signedIn = await requestJson(apiUrl + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(
    signedIn.response.status,
    200,
    "Local Auth password sign-in failed: " + JSON.stringify(signedIn.body),
  );
  assert.equal(signedIn.body?.user?.id, id);
  assert.ok(signedIn.body?.access_token, "Local Auth did not issue a user JWT");
  return { id, token: signedIn.body.access_token };
}

async function appRequest(path, token, method = "GET", payload) {
  const headers = new Headers({ Origin: uiOrigin });
  if (token) headers.set("Authorization", "Bearer " + token);
  if (payload !== undefined) headers.set("Content-Type", "application/json");

  const request = new Request("https://system-hub.local" + path, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const response = await worker.fetch(request, workerEnv);
  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }
  }
  return { status: response.status, body };
}

const suffix = randomUUID();
const password = "NOVA-local-" + randomUUID() + "-Aa9!";
const emailA = "nova-owner-a-" + suffix + "@example.test";
const emailB = "nova-owner-b-" + suffix + "@example.test";
let userA;
let userB;

try {
  const unauthenticated = await appRequest("/v1/agent/threads", null);
  assert.equal(unauthenticated.status, 401);

  userA = await createLocalUser(emailA, password);
  userB = await createLocalUser(emailB, password);

  const createdThread = await appRequest(
    "/v1/agent/threads",
    userA.token,
    "POST",
    { title: "Local Supabase Auth isolation test" },
  );
  assert.equal(
    createdThread.status,
    201,
    "Owner A could not create thread: " + JSON.stringify(createdThread.body),
  );
  const threadId = createdThread.body?.thread?.id;
  assert.ok(threadId);
  assert.equal(createdThread.body?.executionEnabled, false);
  assert.equal(createdThread.body?.liveTradingEnabled, false);

  const ownerAThreads = await appRequest("/v1/agent/threads", userA.token);
  assert.equal(ownerAThreads.status, 200);
  assert.ok(ownerAThreads.body.threads.some((thread) => thread.id === threadId));

  const ownerBThreads = await appRequest("/v1/agent/threads", userB.token);
  assert.equal(ownerBThreads.status, 200);
  assert.ok(
    !ownerBThreads.body.threads.some((thread) => thread.id === threadId),
    "User B must not list User A's thread",
  );

  const proposal = {
    title: "NOVA research-only draft",
    summary: "For research review only; no broker or account action.",
    market: "XAU/USD",
    timeframe: "1h",
    riskProfile: "low",
  };

  const foreignCreate = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userB.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(foreignCreate.status, 404);
  assert.equal(foreignCreate.body?.error, "thread_not_found");

  const createdApproval = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(
    createdApproval.status,
    201,
    "Owner A could not create approval: " + JSON.stringify(createdApproval.body),
  );
  const approvalId = createdApproval.body?.approval?.id;
  assert.ok(approvalId);
  assert.equal(createdApproval.body?.approval?.status, "pending");

  const ownerAApprovals = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
  );
  assert.equal(ownerAApprovals.status, 200);
  assert.ok(ownerAApprovals.body.approvals.some((item) => item.id === approvalId));

  const foreignApprovalList = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userB.token,
  );
  assert.equal(foreignApprovalList.status, 404);
  assert.equal(foreignApprovalList.body?.error, "thread_not_found");

  const foreignDecision = await appRequest(
    "/v1/agent/approvals/" + approvalId + "/decision",
    userB.token,
    "POST",
    { decision: "approve", note: "Foreign owner must be rejected" },
  );
  assert.equal(foreignDecision.status, 404);
  assert.equal(foreignDecision.body?.error, "approval_not_found");

  const ownerDecision = await appRequest(
    "/v1/agent/approvals/" + approvalId + "/decision",
    userA.token,
    "POST",
    { decision: "approve", note: "Local owner-session integration test" },
  );
  assert.equal(
    ownerDecision.status,
    200,
    "Owner A could not resolve approval: " + JSON.stringify(ownerDecision.body),
  );
  assert.equal(ownerDecision.body?.approval?.status, "approved");
  assert.equal(ownerDecision.body?.agentGraphResumeEnabled, false);
  assert.equal(ownerDecision.body?.executionEnabled, false);
  assert.equal(ownerDecision.body?.liveTradingEnabled, false);
  assert.equal(ownerDecision.body?.brokerMutationEnabled, false);

  const replay = await appRequest(
    "/v1/agent/approvals/" + approvalId + "/decision",
    userA.token,
    "POST",
    { decision: "approve" },
  );
  assert.equal(replay.status, 409);
  assert.equal(replay.body?.error, "approval_already_resolved");

  const secondApproval = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(secondApproval.status, 201);
  const secondApprovalId = secondApproval.body?.approval?.id;
  assert.ok(secondApprovalId);

  const editedProposal = {
    ...proposal,
    title: "Edited NOVA research-only draft",
    summary: "Revised research text; submit a fresh review before acceptance.",
  };
  const editDecision = await appRequest(
    "/v1/agent/approvals/" + secondApprovalId + "/decision",
    userA.token,
    "POST",
    { decision: "edit", note: "Review revised content", editedProposal },
  );
  assert.equal(editDecision.status, 200);
  assert.equal(editDecision.body?.approval?.status, "edited");
  assert.equal(editDecision.body?.approval?.decision_payload?.summary, editedProposal.summary);
  assert.equal(editDecision.body?.agentGraphResumeEnabled, false);

  const restoredEdit = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
  );
  const restored = restoredEdit.body.approvals.find((item) => item.id === secondApprovalId);
  assert.equal(restored?.status, "edited");
  assert.equal(restored?.decision_payload?.summary, editedProposal.summary);

  const thirdApproval = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
    "POST",
    { requestType: "strategy_draft_review", proposal },
  );
  assert.equal(thirdApproval.status, 201);
  const thirdApprovalId = thirdApproval.body?.approval?.id;
  assert.ok(thirdApprovalId);

  const rejectDecision = await appRequest(
    "/v1/agent/approvals/" + thirdApprovalId + "/decision",
    userA.token,
    "POST",
    { decision: "reject", note: "Research draft not accepted" },
  );
  assert.equal(rejectDecision.status, 200);
  assert.equal(rejectDecision.body?.approval?.status, "rejected");
  assert.equal(rejectDecision.body?.approval?.decision_payload, null);

  const restoredReject = await appRequest(
    "/v1/agent/threads/" + threadId + "/approvals",
    userA.token,
  );
  assert.equal(
    restoredReject.body.approvals.find((item) => item.id === thirdApprovalId)?.status,
    "rejected",
  );

  console.log(
    "PASS: local Auth users A/B; owner-scoped threads and approvals; foreign create/read/decision denied; approve/reject/edit persisted; replay rejected.",
  );
  console.log(
    "SAFETY: disposable local Supabase only; no hosted project, MT5 terminal, broker order, account mutation or graph resume contacted.",
  );
} finally {
  for (const user of [userA, userB]) {
    if (!user?.id) continue;
    await requestJson(apiUrl + "/auth/v1/admin/users/" + user.id, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
      },
    }).catch(() => {});
  }
}
