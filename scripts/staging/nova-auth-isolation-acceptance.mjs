import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const STAGING_URL = "https://rovhmjeowracayicbqij.supabase.co";
const DESCRIPTION = "บัญชีนี้ใช้ในการทดสอบระบบเท่านั้น ไม่ใช่บัญชีผู้ใช้งานจริง";
const PURPOSE = "system_test_only";
const evidence = {
  timestamp: new Date().toISOString(),
  project_ref: "rovhmjeowracayicbqij",
  environment: "staging_only",
  purpose: PURPOSE,
  description: DESCRIPTION,
  status: "BLOCKED",
  created_accounts: 0,
  checks: [],
  cleanup: {
    delete_success_count: 0,
    confirmed_not_found_count: 0,
    owned_threads_removed: false,
    owned_approvals_removed: false,
    verified: false,
  },
  secrets_or_sessions_recorded: false,
};

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = join(workspace, "reports");
const evidencePath = join(evidenceDir, "nova-staging-auth-evidence.json");

function record(name, passed) {
  evidence.checks.push({ name, passed: Boolean(passed) });
  assert.ok(passed, name);
}

function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function sessionHeaders(publishableKey, accessToken, withBody = false) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    ...(withBody ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
}

async function api(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { /* sanitized status is sufficient */ }
  }
  return { status: response.status, data };
}

function writeEvidence() {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const checks = evidence.checks.map(x => `- ${x.passed ? "PASS" : "FAIL"} — ${x.name}`).join("\n");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## NOVA Staging Auth Isolation",
        "",
        `- Status: **${evidence.status}**`,
        `- Staging project: ${evidence.project_ref}`,
        `- Temporary accounts created: ${evidence.created_accounts}`,
        `- Deleted: ${evidence.cleanup.delete_success_count}`,
        `- Confirmed missing: ${evidence.cleanup.confirmed_not_found_count}`,
        `- Cleanup verified: ${evidence.cleanup.verified}`,
        "",
        "### Checks",
        checks || "- No checks executed",
        "",
        "No email, password, OTP, JWT, user ID, API key or broker data is included.",
        "",
      ].join("\n"),
    );
  }
}

const publishableKey = process.env.NOVA_STAGING_SUPABASE_PUBLISHABLE_KEY || "";
const serviceRoleKey = process.env.NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY || "";
const expectedUrl = process.env.NOVA_STAGING_SUPABASE_URL || "";

if (!publishableKey || !serviceRoleKey || expectedUrl !== STAGING_URL) {
  evidence.failure_code = "required_staging_secrets_missing_or_url_mismatch";
  writeEvidence();
  console.error("BLOCKED: add the dedicated staging URL, publishable key and service_role key as GitHub Actions secrets; no Auth API request was made.");
  process.exit(2);
}

const createdUsers = [];
const userTokens = new Map();
let failureCode = null;

try {
  // Fail closed if the configured endpoint is not the specifically authorized staging project.
  const health = await api("/auth/v1/health", { headers: { apikey: publishableKey } });
  record("staging_auth_endpoint_reachable", health.status >= 200 && health.status < 300);

  for (const label of ["a", "b"]) {
    const email = `nova-staging-${label}-${randomUUID()}@example.test`;
    const password = `NOVA-${randomUUID()}-${randomUUID()}-Aa9!`;
    const created = await api("/auth/v1/admin/users", {
      method: "POST",
      headers: adminHeaders(serviceRoleKey),
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { purpose: PURPOSE, description: DESCRIPTION },
      },
    });
    const userId = created.data?.id;
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`auth_admin_create_${label}_http_${created.status}`);
    }
    if (typeof userId !== "string") throw new Error(`auth_admin_create_${label}_missing_id`);
    createdUsers.push({ id: userId, email, password });
    record(`user_${label}_metadata_exact`,
      created.data?.user_metadata?.purpose === PURPOSE &&
      created.data?.user_metadata?.description === DESCRIPTION);

    const signedIn = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: { email, password },
    });
    if (signedIn.status !== 200 ||
        signedIn.data?.user?.id !== userId ||
        typeof signedIn.data?.access_token !== "string") {
      throw new Error(`auth_session_${label}_http_${signedIn.status}`);
    }
    userTokens.set(userId, signedIn.data.access_token);
  }
  evidence.created_accounts = createdUsers.length;
  record("two_distinct_auth_users_created", createdUsers.length === 2 && createdUsers[0].id !== createdUsers[1].id);

  const userA = createdUsers[0];
  const userB = createdUsers[1];
  const tokenA = userTokens.get(userA.id);
  const tokenB = userTokens.get(userB.id);
  assert.ok(tokenA && tokenB && tokenA !== tokenB, "two_independent_sessions");

  const thread = await api("/rest/v1/nova_agent_threads?select=id,title", {
    method: "POST",
    headers: sessionHeaders(publishableKey, tokenA, true),
    body: { title: "Temporary staging User A isolation test" },
  });
  const threadId = Array.isArray(thread.data) ? thread.data[0]?.id : null;
  record("user_a_create_own_thread", thread.status === 201 && typeof threadId === "string");

  const ownThread = await api(`/rest/v1/nova_agent_threads?select=id&id=eq.${threadId}`, {
    headers: sessionHeaders(publishableKey, tokenA),
  });
  record("user_a_reads_own_thread",
    ownThread.status === 200 && Array.isArray(ownThread.data) && ownThread.data.length === 1);

  const foreignThread = await api(`/rest/v1/nova_agent_threads?select=id&id=eq.${threadId}`, {
    headers: sessionHeaders(publishableKey, tokenB),
  });
  record("user_b_cannot_read_user_a_thread",
    foreignThread.status === 200 && Array.isArray(foreignThread.data) && foreignThread.data.length === 0);

  const proposal = {
    title: "Temporary staging strategy draft",
    summary: "RLS isolation test only; no broker or trading operation.",
    market: "XAU/USD",
    timeframe: "1h",
    riskProfile: "low",
  };
  const approvalPayload = {
    p_thread_id: threadId,
    p_request_type: "strategy_draft_review",
    p_proposal: proposal,
    p_proposal_hash: "a".repeat(64),
    p_policy_version: "nova-approval.v1",
    p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  const createdApproval = await api("/rest/v1/rpc/nova_create_approval", {
    method: "POST",
    headers: sessionHeaders(publishableKey, tokenA, true),
    body: approvalPayload,
  });
  const approvalRow = Array.isArray(createdApproval.data) ? createdApproval.data[0] : createdApproval.data;
  const approvalId = approvalRow?.id;
  record("user_a_create_own_approval", createdApproval.status === 200 && typeof approvalId === "string");

  const ownApproval = await api(
    `/rest/v1/nova_approval_requests?select=id&thread_id=eq.${threadId}`,
    { headers: sessionHeaders(publishableKey, tokenA) },
  );
  record("user_a_reads_own_approval",
    ownApproval.status === 200 && Array.isArray(ownApproval.data) && ownApproval.data.length === 1);

  const foreignApproval = await api(
    `/rest/v1/nova_approval_requests?select=id&thread_id=eq.${threadId}`,
    { headers: sessionHeaders(publishableKey, tokenB) },
  );
  record("user_b_cannot_read_user_a_approval",
    foreignApproval.status === 200 && Array.isArray(foreignApproval.data) && foreignApproval.data.length === 0);

  const foreignCreate = await api("/rest/v1/rpc/nova_create_approval", {
    method: "POST",
    headers: sessionHeaders(publishableKey, tokenB, true),
    body: approvalPayload,
  });
  record("user_b_cannot_create_approval_in_user_a_thread", foreignCreate.status >= 400);

  const foreignResolve = await api("/rest/v1/rpc/nova_resolve_approval", {
    method: "POST",
    headers: sessionHeaders(publishableKey, tokenB, true),
    body: {
      p_approval_id: approvalId,
      p_decision: "approve",
      p_decision_note: null,
      p_decision_payload: null,
      p_policy_version: "nova-approval.v1",
    },
  });
  const resolveResult = Array.isArray(foreignResolve.data) ? foreignResolve.data[0] : foreignResolve.data;
  record("user_b_cannot_resolve_user_a_approval",
    foreignResolve.status === 200 && resolveResult?.result_code === "not_found");
} catch (error) {
  failureCode = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
    ? error.message
    : "staging_acceptance_failed";
} finally {
  // Revoke each temporary user's sessions and hard-delete every account created in this run.
  for (const user of createdUsers) {
    const token = userTokens.get(user.id);
    if (token) {
      await api("/auth/v1/logout?scope=global", {
        method: "POST",
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }

    let deleted = false;
    for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
      const result = await api(`/auth/v1/admin/users/${user.id}?should_soft_delete=false`, {
        method: "DELETE",
        headers: adminHeaders(serviceRoleKey),
      }).catch(() => null);
      deleted = Boolean(result && (result.status === 200 || result.status === 204 || result.status === 404));
    }
    if (deleted) evidence.cleanup.delete_success_count++;

    const lookup = await api(`/auth/v1/admin/users/${user.id}`, {
      headers: adminHeaders(serviceRoleKey),
    }).catch(() => null);
    if (lookup?.status === 404) evidence.cleanup.confirmed_not_found_count++;
  }

  if (createdUsers.length > 0) {
    const ids = createdUsers.map(x => x.id).join(",");
    const [threads, approvals] = await Promise.all([
      api(`/rest/v1/nova_agent_threads?select=id&user_id=in.(${ids})`, {
        headers: adminHeaders(serviceRoleKey),
      }).catch(() => null),
      api(`/rest/v1/nova_approval_requests?select=id&user_id=in.(${ids})`, {
        headers: adminHeaders(serviceRoleKey),
      }).catch(() => null),
    ]);
    evidence.cleanup.owned_threads_removed =
      threads?.status === 200 && Array.isArray(threads.data) && threads.data.length === 0;
    evidence.cleanup.owned_approvals_removed =
      approvals?.status === 200 && Array.isArray(approvals.data) && approvals.data.length === 0;
  } else {
    evidence.cleanup.owned_threads_removed = true;
    evidence.cleanup.owned_approvals_removed = true;
  }

  evidence.cleanup.verified =
    createdUsers.length === 2 &&
    evidence.cleanup.delete_success_count === 2 &&
    evidence.cleanup.confirmed_not_found_count === 2 &&
    evidence.cleanup.owned_threads_removed &&
    evidence.cleanup.owned_approvals_removed;
}

const testsPassed = evidence.checks.length === 12 && evidence.checks.every(x => x.passed);
evidence.failure_code = failureCode;
evidence.status = !failureCode && testsPassed && evidence.cleanup.verified ? "PASS" : "FAIL";
writeEvidence();

console.log(JSON.stringify({
  status: evidence.status,
  project_ref: evidence.project_ref,
  created_accounts: evidence.created_accounts,
  checks: evidence.checks,
  cleanup: evidence.cleanup,
  secrets_or_sessions_recorded: false,
  failure_code: evidence.failure_code,
}));

if (evidence.status !== "PASS") process.exit(1);
