import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const threads = source("../frontend/app/api/agent/threads/route.js");
const approvals = source("../frontend/app/api/agent/threads/[threadId]/approvals/route.js");
const decision = source("../frontend/app/api/agent/approvals/[approvalId]/decision/route.js");
const serverHelper = source("../frontend/lib/agent-approval-server.js");
const approvalCard = source("../frontend/components/approval-card.jsx");
const chatPage = source("../frontend/app/chat/page.jsx");

test("every protected approval route authenticates before reading POST body", () => {
  for (const [name, route] of [["threads", threads], ["approvals", approvals], ["decision", decision]]) {
    const authAt = route.indexOf("await authenticateAgentRequest(request)");
    assert.notEqual(authAt, -1, name + " route must authenticate");
    const bodyAt = route.indexOf("await readAgentJson(request");
    if (bodyAt !== -1) assert.ok(authAt < bodyAt, name + " route reads the body only after authentication");
  }
});

test("workflow is disabled by default and has independent server-side gating", () => {
  for (const [name, route] of [["threads", threads], ["approvals", approvals], ["decision", decision]]) {
    assert.match(route, /process\.env\.NOVA_APPROVALS_ENABLED === "true"/, name + " route requires the server-side flag");
    assert.match(route, /approval_workflow_disabled/, name + " route fails closed when disabled");
  }
  assert.match(chatPage, /process\.env\.NEXT_PUBLIC_NOVA_APPROVALS_ENABLED === 'true'/);
});

test("database calls are user-scoped and use RPCs for approval mutations", () => {
  assert.match(threads, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(approvals, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(approvals, /\.rpc\("nova_create_approval"/);
  assert.match(decision, /\.rpc\("nova_resolve_approval"/);
  assert.doesNotMatch(threads + approvals + decision, /service_role|SERVICE_ROLE_KEY/i);
});

test("decision endpoint maps missing, expired and replayed approvals to fail-closed responses", () => {
  assert.match(decision, /not_found: \["approval_not_found", 404\]/);
  assert.match(decision, /already_resolved: \["approval_already_resolved", 409\]/);
  assert.match(decision, /expired: \["approval_expired", 410\]/);
  assert.match(decision, /p_policy_version: NOVA_APPROVAL_POLICY_VERSION/);
  assert.match(decision, /brokerMutationEnabled: false/);
});

test("review UI states explicitly that approval is research-only, never broker execution", () => {
  const card = source("../frontend/components/approval-card.jsx");
  assert.match(card, /ไม่มีการส่งคำสั่งซื้อขาย/);
  assert.match(card, /Broker mutation disabled/);
  assert.match(card, /onReviewEdited/);
  assert.match(serverHelper, /auth\.getUser\(accessToken\)/);
  assert.match(serverHelper, /Cache-Control": "no-store"/);
});

test("expired UI requests server-side expiry reconciliation, never a rejection", () => {
  const expiryStart = approvalCard.indexOf("{approval.status === 'pending' && expired && (");
  const expiryEnd = approvalCard.indexOf("{approval.status !== 'pending'", expiryStart);
  assert.notEqual(expiryStart, -1, "expired approval UI must exist");
  assert.notEqual(expiryEnd, -1, "final approval state must follow expiry UI");
  const expiredBlock = approvalCard.slice(expiryStart, expiryEnd);
  assert.ok(expiredBlock.includes("submitDecision('expire')"));
  assert.equal(expiredBlock.includes("submitDecision('reject')"), false);
  assert.ok(decision.includes("approval_not_expired"));
  assert.ok(chatPage.includes("เวลาในอุปกรณ์เร็วกว่าฐานข้อมูล"));
});

test("JSON request reader rejects oversized bodies before unbounded buffering", () => {
  assert.ok(serverHelper.includes("content-length"));
  assert.ok(serverHelper.includes("request.body?.getReader()"));
  assert.ok(serverHelper.includes("totalBytes > maxBytes"));
  assert.ok(serverHelper.includes("reader.cancel()"));
  assert.equal(serverHelper.includes("request.text()"), false);
});
