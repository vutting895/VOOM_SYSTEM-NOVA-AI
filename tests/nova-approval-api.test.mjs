import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../src/server/nova-approval-api.mjs", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

test("protected Approval API authenticates JWT before parsing JSON request bodies", () => {
  const authUse = api.indexOf("router.use(authenticateAgentRequest)");
  const enabledUse = api.indexOf("router.use(requireApprovalsEnabled)");
  const parser = api.indexOf("const JSON_BODY = express.json");
  assert.notEqual(authUse, -1);
  assert.ok(authUse < enabledUse);
  assert.ok(authUse < api.indexOf('router.post("/threads", JSON_BODY'));
  assert.ok(authUse < api.indexOf('router.post("/threads/:threadId/approvals", JSON_BODY'));
  assert.ok(authUse < api.indexOf('router.post("/approvals/:approvalId/decision", JSON_BODY'));
  assert.ok(parser >= 0);
  assert.match(api, /req\.get\("authorization"\)/);
  assert.match(api, /supabase\.auth\.getUser\(match\[1\]\)/);
});

test("Approval API is disabled by default and uses only the request owner's JWT", () => {
  assert.match(api, /process\.env\.NOVA_APPROVALS_ENABLED !== "true"/);
  assert.match(api, /SUPABASE_ANON_KEY/);
  assert.match(api, /Authorization: "Bearer " \+ match\[1\]/);
  assert.match(api, /\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(api, /service_role|SERVICE_ROLE_KEY/i);
  assert.match(server, /registerNovaApprovalRoutes\(app\)/);
});

test("Approval creation and resolution use the durable database RPCs", () => {
  assert.match(api, /\.rpc\("nova_create_approval"/);
  assert.match(api, /\.rpc\("nova_resolve_approval"/);
  assert.match(api, /NOVA_APPROVAL_POLICY_VERSION/);
  assert.match(api, /NOVA_APPROVAL_REQUEST_TYPE/);
  assert.match(api, /approval_already_resolved/);
  assert.match(api, /approval_expired/);
});

test("audit history is read-only, ordered, owner-filtered and never grants execution", () => {
  assert.match(api, /router\.get\("\/approvals\/:approvalId\/events"/);
  assert.match(api, /\.from\("nova_approval_events"\)/);
  assert.match(api, /\.eq\("approval_id", approvalId\)/);
  assert.match(api, /\.eq\("user_id", user\.id\)/);
  assert.match(api, /\.order\("event_sequence", \{ ascending: true \}\)/);
  assert.match(api, /executionEnabled: false/);
  assert.match(api, /liveTradingEnabled: false/);
  assert.match(api, /brokerMutationEnabled: false/);
});

test("Approval API starts LangGraph checkpoints and resumes only from the persisted approval outcome", () => {
  assert.match(api, /startApprovalCheckpoint\(user\.id, row\)/);
  assert.match(api, /resumeApprovalCheckpoint\(user\.id, approvalSnapshot/);
  assert.match(api, /router\.post\("\/approvals\/:approvalId\/graph\/start"/);
  assert.match(api, /router\.post\("\/approvals\/:approvalId\/graph\/resume"/);
  assert.match(api, /findOwnedTerminalAuditEvent\(supabase, approval, user\.id\)/);
  assert.match(api, /async function findOwnedTerminalAuditEvent[\s\S]*?\.from\("nova_approval_events"\)/);
  assert.match(api, /\.eq\("event_type", approval\.status\)/);
  assert.match(api, /\.eq\("to_status", approval\.status\)/);
  assert.doesNotMatch(api, /resumeApprovalCheckpoint\(user\.id, approvalSnapshot, \{\s*status: row\.status,\s*note: decision\.note/);
  assert.match(api, /NOVA_LANGGRAPH_ENABLED/);
});

test("Graph recovery does not accept a client-provided decision and remains broker-free", () => {
  const start = api.indexOf('router.post("/approvals/:approvalId/graph/resume"');
  const end = api.indexOf('router.get("/approvals/:approvalId/events"', start);
  const recovery = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(recovery, /findOwnedApproval\(supabase, approvalId, user\.id\)/);
  assert.match(recovery, /\.from\("nova_approval_events"\)/);
  assert.doesNotMatch(recovery, /req\.body|req\.body\?/);
  assert.match(recovery, /resumeApprovalCheckpoint\(user\.id, approval/);
  assert.match(api, /brokerMutationEnabled: false/);
});

test("legacy broker/Live Trading and legacy simulated approval endpoints remain blocked", () => {
  assert.match(server, /req\.path\.startsWith\('\/api\/orders\/'\)/);
  assert.match(server, /req\.path\.startsWith\('\/api\/live-trading\/'\)/);
  assert.match(server, /req\.path === '\/api\/agent\/approvals\/decision'/);
  assert.match(server, /const liveTradingEnabled = false as const/);
});
