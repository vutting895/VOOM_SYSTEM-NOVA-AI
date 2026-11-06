import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../worker.js";

const SUPABASE_ORIGIN = "https://supabase.test";
const UI_ORIGIN = "https://voomsystem.netlify.app";
const USER_TOKEN = "test-user-access-token";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPROVAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const env = {
  SUPABASE_URL: SUPABASE_ORIGIN,
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: UI_ORIGIN,
  NOVA_APPROVALS_ENABLED: "true"
};

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Origin")) headers.set("Origin", UI_ORIGIN);
  if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + USER_TOKEN);
  return new Request("https://hub.test" + path, { ...options, headers });
}

function installMocks({
  userId = USER_A,
  threadRows = [],
  approvalRows = [],
  createThreadRow,
  createApprovalRow,
  resolveApprovalRow,
  rpcCreateError,
  rpcResolveError,
  beforeRest
} = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    calls.push({ url, init });

    if (url.origin === SUPABASE_ORIGIN && url.pathname === "/auth/v1/user") {
      assert.equal(init.method, "GET");
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      assert.equal(init.redirect, "manual");
      return Response.json({ id: userId });
    }

    if (url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/rest/v1/")) {
      await beforeRest?.({ url, init, calls, userId });
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(init.headers.Authorization, "Bearer " + USER_TOKEN);
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");

      if (url.pathname === "/rest/v1/nova_agent_threads" && (init.method || "GET") === "GET") {
        const filtered = threadRows.filter((row) => {
          const userFilter = url.searchParams.get("user_id");
          const idFilter = url.searchParams.get("id");
          const stateFilter = url.searchParams.get("state");
          return (!userFilter || userFilter === "eq." + row.user_id) &&
            (!idFilter || idFilter === "eq." + row.id) &&
            (!stateFilter || stateFilter === "eq." + row.state);
        });
        return Response.json(filtered);
      }

      if (url.pathname === "/rest/v1/nova_agent_threads" && init.method === "POST") {
        const body = JSON.parse(init.body);
        return Response.json(createThreadRow || [{
          id: THREAD_ID,
          user_id: body.user_id,
          title: body.title,
          state: body.state,
          policy_version: body.policy_version
        }], { status: 201 });
      }

      if (url.pathname === "/rest/v1/nova_approval_requests" && (init.method || "GET") === "GET") {
        const filtered = approvalRows.filter((row) =>
          url.searchParams.get("thread_id") === "eq." + row.thread_id &&
          url.searchParams.get("user_id") === "eq." + row.user_id
        );
        return Response.json(filtered);
      }

      if (url.pathname === "/rest/v1/rpc/nova_create_approval" && init.method === "POST") {
        if (rpcCreateError) return Response.json({ code: rpcCreateError }, { status: 400 });
        const body = JSON.parse(init.body);
        return Response.json(createApprovalRow || [{
          id: APPROVAL_ID,
          thread_id: body.p_thread_id,
          request_type: body.p_request_type,
          proposal: body.p_proposal,
          proposal_hash: "d".repeat(64),
          policy_version: body.p_policy_version,
          status: "pending",
          expires_at: body.p_expires_at
        }], { status: 200 });
      }

      if (url.pathname === "/rest/v1/rpc/nova_resolve_approval" && init.method === "POST") {
        if (rpcResolveError) return Response.json({ code: rpcResolveError }, { status: 400 });
        const body = JSON.parse(init.body);
        return Response.json(resolveApprovalRow || [{
          result_code: "resolved",
          request_id: body.p_approval_id,
          thread_id: THREAD_ID,
          status: body.p_decision === "approve" ? "approved"
            : body.p_decision === "reject" ? "rejected" : "edited",
          decided_at: "2026-11-07T00:00:00Z",
          decision_payload: body.p_decision_payload
        }]);
      }

      throw new Error("Unexpected PostgREST request: " + url.pathname + " " + (init.method || "GET"));
    }

    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
  return calls;
}

function validProposal(overrides = {}) {
  return {
    title: "NOVA EMA/RSI research draft",
    summary: "Research only. Not backtested and not executable.",
    market: "XAU/USD",
    timeframe: "15m",
    riskProfile: "low",
    ...overrides
  };
}

test("health is public, reports feature flag state, and keeps trading disabled", async () => {
  const response = await worker.fetch(request("/health", { headers: { Origin: UI_ORIGIN } }), {
    ...env,
    NOVA_APPROVALS_ENABLED: undefined
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "voom-system-hub");
  assert.equal(body.agentApprovalsEnabled, false);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
});

test("approval routes authenticate before parsing a request body", async () => {
  let outboundCalls = 0;
  globalThis.fetch = async () => { outboundCalls += 1; throw new Error("must not call"); };
  const response = await worker.fetch(request("/v1/agent/threads", {
    method: "POST",
    headers: { Origin: UI_ORIGIN, Authorization: "", "Content-Type": "application/json" },
    body: "{invalid-json"
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
  assert.equal(outboundCalls, 0);
});

test("invalid Supabase sessions are rejected before database access", async () => {
  let restCalled = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ message: "invalid" }, { status: 401 });
    restCalled = true;
    throw new Error("database must not be called");
  };
  const response = await worker.fetch(request("/v1/agent/threads"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
  assert.equal(restCalled, false);
});

test("approval API is disabled by default and makes no database request", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/threads"), {
    ...env,
    NOVA_APPROVALS_ENABLED: "false"
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "approval_workflow_disabled");
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("an untrusted browser origin is rejected", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/threads", {
    headers: { Origin: "https://attacker.example" }
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "origin_not_allowed");
  assert.equal(calls.length, 0);
});

test("thread list filters by authenticated owner and includes disabled safety flags", async () => {
  const calls = installMocks({
    threadRows: [
      { id: THREAD_ID, user_id: USER_A, title: "A", state: "active" },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", user_id: USER_B, title: "B", state: "active" }
    ]
  });
  const response = await worker.fetch(request("/v1/agent/threads?state=active"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.threads.length, 1);
  assert.equal(body.threads[0].user_id, USER_A);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  const query = calls.find((call) => call.url.pathname === "/rest/v1/nova_agent_threads");
  assert.equal(query.url.searchParams.get("user_id"), "eq." + USER_A);
  assert.equal(query.url.searchParams.get("state"), "eq.active");
});

test("thread creation derives user and state from the authenticated server context", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "  Research thread  " })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.thread.user_id, USER_A);
  assert.equal(body.thread.title, "Research thread");
  assert.equal(body.thread.state, "active");
  assert.equal(body.thread.policy_version, "nova-approval.v1");
  assert.equal(body.liveTradingEnabled, false);

  const insert = calls.find((call) =>
    call.url.pathname === "/rest/v1/nova_agent_threads" && call.init.method === "POST"
  );
  const payload = JSON.parse(insert.init.body);
  assert.deepEqual(payload, {
    user_id: USER_A,
    title: "Research thread",
    state: "active",
    policy_version: "nova-approval.v1"
  });
});

test("thread creation rejects caller-supplied owner or arbitrary fields", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "bad", user_id: USER_B })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "thread_fields_invalid");
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("thread list rejects unsupported state values", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/threads?state=running"), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "thread_state_invalid");
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("approval list verifies thread ownership before querying approval rows", async () => {
  const calls = installMocks({
    userId: USER_B,
    threadRows: [{ id: THREAD_ID, user_id: USER_A, state: "active" }]
  });
  const response = await worker.fetch(request("/v1/agent/threads/" + THREAD_ID + "/approvals"), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "thread_not_found");
  assert.equal(calls.filter((call) => call.url.pathname === "/rest/v1/nova_approval_requests").length, 0);
});

test("approval list scopes database read to owner and thread", async () => {
  const calls = installMocks({
    threadRows: [{ id: THREAD_ID, user_id: USER_A, state: "awaiting_review" }],
    approvalRows: [{
      id: APPROVAL_ID, thread_id: THREAD_ID, user_id: USER_A,
      request_type: "strategy_draft_review", status: "pending"
    }]
  });
  const response = await worker.fetch(request("/v1/agent/threads/" + THREAD_ID + "/approvals"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.approvals.length, 1);
  const query = calls.find((call) => call.url.pathname === "/rest/v1/nova_approval_requests");
  assert.equal(query.url.searchParams.get("thread_id"), "eq." + THREAD_ID);
  assert.equal(query.url.searchParams.get("user_id"), "eq." + USER_A);
});

test("create approval uses the existing owner-bound RPC and strict research proposal", async () => {
  const calls = installMocks({
    threadRows: [{ id: THREAD_ID, user_id: USER_A, state: "active" }]
  });
  const response = await worker.fetch(request("/v1/agent/threads/" + THREAD_ID + "/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "strategy_draft_review",
      proposal: validProposal()
    })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.approval.status, "pending");
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerMutationEnabled, false);

  const rpc = calls.find((call) => call.url.pathname === "/rest/v1/rpc/nova_create_approval");
  const payload = JSON.parse(rpc.init.body);
  assert.equal(payload.p_thread_id, THREAD_ID);
  assert.equal(payload.p_request_type, "strategy_draft_review");
  assert.equal(payload.p_policy_version, "nova-approval.v1");
  assert.equal(payload.p_proposal_hash.length, 64);
  assert.match(payload.p_proposal_hash, /^[a-f0-9]{64}$/);
  const ttl = Date.parse(payload.p_expires_at) - Date.now();
  assert.ok(ttl > 9 * 60 * 1000 && ttl <= 10 * 60 * 1000 + 1000);
});

test("create approval rejects executable fields without calling the database RPC", async () => {
  const calls = installMocks({
    threadRows: [{ id: THREAD_ID, user_id: USER_A, state: "active" }]
  });
  const response = await worker.fetch(request("/v1/agent/threads/" + THREAD_ID + "/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "strategy_draft_review",
      proposal: { ...validProposal(), volume: 0.1 }
    })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "approval_proposal_fields_invalid");
  assert.equal(calls.filter((call) => call.url.pathname === "/rest/v1/rpc/nova_create_approval").length, 0);
});

test("create approval maps duplicate pending requests to conflict", async () => {
  const calls = installMocks({
    threadRows: [{ id: THREAD_ID, user_id: USER_A, state: "active" }],
    rpcCreateError: "23505"
  });
  const response = await worker.fetch(request("/v1/agent/threads/" + THREAD_ID + "/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "strategy_draft_review", proposal: validProposal() })
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "approval_already_pending");
  assert.equal(calls.filter((call) => call.url.pathname === "/rest/v1/rpc/nova_create_approval").length, 1);
});

test("decision calls the atomic one-time RPC and never resumes a graph or broker action", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/approvals/" + APPROVAL_ID + "/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve", note: "Research accepted" })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.approval.status, "approved");
  assert.equal(body.agentGraphResumeEnabled, false);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerMutationEnabled, false);

  const rpc = calls.find((call) => call.url.pathname === "/rest/v1/rpc/nova_resolve_approval");
  const payload = JSON.parse(rpc.init.body);
  assert.equal(payload.p_approval_id, APPROVAL_ID);
  assert.equal(payload.p_decision, "approve");
  assert.equal(payload.p_decision_note, "Research accepted");
  assert.equal(payload.p_policy_version, "nova-approval.v1");
});

test("decision replay is reported as conflict and remains non-executable", async () => {
  const calls = installMocks({
    rpcResolveError: undefined,
    resolveApprovalRow: [{
      result_code: "already_resolved",
      request_id: APPROVAL_ID,
      thread_id: THREAD_ID,
      status: "approved"
    }]
  });
  const response = await worker.fetch(request("/v1/agent/approvals/" + APPROVAL_ID + "/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" })
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "approval_already_resolved");
  assert.equal(calls.filter((call) => call.url.pathname === "/rest/v1/rpc/nova_resolve_approval").length, 1);
});

test("edited proposal is a revision, not approval or resume", async () => {
  const calls = installMocks();
  const response = await worker.fetch(request("/v1/agent/approvals/" + APPROVAL_ID + "/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "edit", editedProposal: validProposal({ summary: "Revised research summary" }) })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.approval.status, "edited");
  assert.equal(body.agentGraphResumeEnabled, false);
  const rpc = calls.find((call) => call.url.pathname === "/rest/v1/rpc/nova_resolve_approval");
  assert.equal(JSON.parse(rpc.init.body).p_decision, "edit");
});

test("expired and stale-policy results fail closed", async () => {
  for (const [code, status, error] of [
    ["expired", 410, "approval_expired"],
    ["policy_mismatch", 409, "approval_policy_stale"],
    ["not_found", 404, "approval_not_found"]
  ]) {
    installMocks({
      resolveApprovalRow: [{
        result_code: code, request_id: APPROVAL_ID, thread_id: THREAD_ID, status: "pending"
      }]
    });
    const response = await worker.fetch(request("/v1/agent/approvals/" + APPROVAL_ID + "/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }), env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, error);
  }
});

test("invalid identifiers and unsupported methods are denied", async () => {
  const calls = installMocks();
  const invalidId = await worker.fetch(request("/v1/agent/threads/not-a-uuid/approvals"), env);
  assert.equal(invalidId.status, 404);
  const unsupported = await worker.fetch(request("/v1/agent/threads", { method: "DELETE" }), env);
  assert.equal(unsupported.status, 405);
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("JSON body size and content type are bounded", async () => {
  installMocks();
  const badType = await worker.fetch(request("/v1/agent/threads", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not-json"
  }), env);
  assert.equal(badType.status, 415);

  const tooLarge = await worker.fetch(request("/v1/agent/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "x".repeat(5000) })
  }), env);
  assert.equal(tooLarge.status, 413);
});

test("module uses only user-scoped publishable-key access and has no broker mutation capability", async () => {
  const source = readFileSync(new URL("../agent-approval.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /service_role|SERVICE_ROLE_KEY|execute_broker_order|place_trade_order|order_submission_enabled/i);
  assert.match(source, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /Authorization: "Bearer " \+ user\.token/);
  assert.match(source, /agentGraphResumeEnabled: false/);
});
