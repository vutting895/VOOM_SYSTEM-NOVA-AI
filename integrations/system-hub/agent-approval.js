export const NOVA_APPROVAL_POLICY_VERSION = "nova-approval.v1";
export const NOVA_APPROVAL_REQUEST_TYPE = "strategy_draft_review";
export const NOVA_APPROVAL_TTL_MS = 10 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROPOSAL_FIELDS = ["title", "summary", "market", "timeframe", "riskProfile"];
const ALLOWED_MARKETS = new Set(["BTC/USDT", "ETH/USDT", "EUR/USD", "XAU/USD", "US30"]);
const ALLOWED_TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d"]);
const ALLOWED_RISK_PROFILES = new Set(["low", "medium", "high"]);
const THREAD_STATES = new Set(["active", "awaiting_review", "closed"]);
const BASE_PATH = "/rest/v1";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

export function isAgentApprovalRoute(pathname) {
  return pathname === "/v1/agent/threads" ||
    /^\/v1\/agent\/threads\/[^/]+\/approvals$/.test(pathname) ||
    /^\/v1\/agent\/approvals\/[^/]+\/decision$/.test(pathname);
}

function exactKeys(value, allowed, required = []) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) &&
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function normalizeStrategyDraftProposal(value) {
  if (!exactKeys(value, PROPOSAL_FIELDS, PROPOSAL_FIELDS)) {
    throw new Error("approval_proposal_fields_invalid");
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (title.length < 1 || title.length > 120) throw new Error("approval_title_invalid");
  if (summary.length < 1 || summary.length > 600) throw new Error("approval_summary_invalid");

  if (value.market !== null && (typeof value.market !== "string" || !ALLOWED_MARKETS.has(value.market))) {
    throw new Error("approval_market_invalid");
  }
  if (value.timeframe !== null &&
    (typeof value.timeframe !== "string" || !ALLOWED_TIMEFRAMES.has(value.timeframe))) {
    throw new Error("approval_timeframe_invalid");
  }
  if (value.riskProfile !== null &&
    (typeof value.riskProfile !== "string" || !ALLOWED_RISK_PROFILES.has(value.riskProfile))) {
    throw new Error("approval_risk_profile_invalid");
  }

  return { title, summary, market: value.market, timeframe: value.timeframe, riskProfile: value.riskProfile };
}

export function normalizeApprovalDecision(value) {
  if (!exactKeys(value, ["decision", "note", "editedProposal"], ["decision"])) {
    throw new Error("approval_decision_fields_invalid");
  }
  if (!["approve", "reject", "edit"].includes(value.decision)) {
    throw new Error("approval_decision_invalid");
  }

  let note = null;
  if (value.note !== undefined && value.note !== null) {
    if (typeof value.note !== "string" || value.note.length > 300) {
      throw new Error("approval_note_invalid");
    }
    note = value.note.trim() || null;
    if (note && note.length > 300) throw new Error("approval_note_invalid");
  }

  const hasEditedProposal = Object.prototype.hasOwnProperty.call(value, "editedProposal");
  if (value.decision === "edit") {
    if (!hasEditedProposal) throw new Error("approval_edited_proposal_required");
    return {
      decision: "edit",
      note,
      editedProposal: normalizeStrategyDraftProposal(value.editedProposal)
    };
  }
  if (hasEditedProposal) throw new Error("approval_decision_payload_not_allowed");
  return { decision: value.decision, note, editedProposal: null };
}

async function readJsonObject(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { ok: false, status: 415, error: "content_type_must_be_application_json" };
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "request_too_large" };
  }
  if (!request.body) return { ok: false, status: 400, error: "invalid_json" };

  let reader;
  try {
    reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "request_too_large" };
      }
      chunks.push(item.value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (!isRecord(value)) return { ok: false, status: 400, error: "invalid_json_object" };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

function supabaseOrigin(env) {
  const configured = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!configured || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function postgrest(env, user, path, options = {}) {
  const origin = supabaseOrigin(env);
  if (!origin) return { ok: false, status: 503, code: "not_configured" };

  let url;
  try {
    url = new URL(BASE_PATH + path, origin);
    for (const [key, value] of Object.entries(options.query || {})) {
      url.searchParams.set(key, String(value));
    }
  } catch {
    return { ok: false, status: 503, code: "invalid_url" };
  }

  const headers = {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    Authorization: "Bearer " + user.token,
    Accept: "application/json"
  };
  const init = {
    method: options.method || "GET",
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000)
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (options.prefer) headers.Prefer = options.prefer;
    init.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, init);
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch { return { ok: false, status: 503, code: "invalid_response" }; }
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: typeof data?.code === "string" ? data.code : "upstream_error"
      };
    }
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, status: 503, code: "unavailable" };
  }
}

function serviceUnavailable(send, error) {
  return send({
    error,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerMutationEnabled: false
  }, 503);
}

async function listThreads(request, env, user, send) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state && !THREAD_STATES.has(state)) {
    return send({ error: "thread_state_invalid" }, 400);
  }

  const result = await postgrest(env, user, "/nova_agent_threads", {
    query: {
      select: "id,title,state,policy_version,created_at,updated_at,last_activity_at",
      user_id: "eq." + user.userId,
      order: "updated_at.desc",
      limit: "50",
      ...(state ? { state: "eq." + state } : {})
    }
  });
  if (!result.ok || !Array.isArray(result.data)) {
    return serviceUnavailable(send, "thread_list_unavailable");
  }
  return send({
    threads: result.data,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
}

async function createThread(request, env, user, send) {
  const parsed = await readJsonObject(request, 4000);
  if (!parsed.ok) return send({ error: parsed.error }, parsed.status);
  if (!exactKeys(parsed.value, ["title"])) return send({ error: "thread_fields_invalid" }, 400);

  const title = parsed.value.title === undefined ? "NOVA draft review" : parsed.value.title;
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 120) {
    return send({ error: "thread_title_invalid" }, 400);
  }

  const result = await postgrest(env, user, "/nova_agent_threads", {
    method: "POST",
    query: { select: "id,title,state,policy_version,created_at,updated_at,last_activity_at" },
    prefer: "return=representation",
    body: {
      user_id: user.userId,
      title: title.trim(),
      state: "active",
      policy_version: NOVA_APPROVAL_POLICY_VERSION
    }
  });
  const thread = Array.isArray(result.data) ? result.data[0] : null;
  if (!result.ok || !thread?.id) return serviceUnavailable(send, "thread_create_unavailable");

  return send({
    thread,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  }, 201);
}

async function getOwnedThread(env, user, threadId) {
  const result = await postgrest(env, user, "/nova_agent_threads", {
    query: {
      select: "id",
      id: "eq." + threadId,
      user_id: "eq." + user.userId,
      limit: "1"
    }
  });
  if (!result.ok || !Array.isArray(result.data)) return { ok: false };
  return { ok: true, thread: result.data[0] || null };
}

async function listApprovals(env, user, threadId, send) {
  if (!isUuid(threadId)) return send({ error: "thread_not_found" }, 404);
  const owned = await getOwnedThread(env, user, threadId);
  if (!owned.ok) return serviceUnavailable(send, "approval_list_unavailable");
  if (!owned.thread) return send({ error: "thread_not_found" }, 404);

  const result = await postgrest(env, user, "/nova_approval_requests", {
    query: {
      select: "id,thread_id,request_type,proposal,proposal_hash,policy_version,status,decision_note,decision_payload,expires_at,created_at,updated_at,decided_at",
      thread_id: "eq." + threadId,
      user_id: "eq." + user.userId,
      order: "created_at.desc",
      limit: "20"
    }
  });
  if (!result.ok || !Array.isArray(result.data)) {
    return serviceUnavailable(send, "approval_list_unavailable");
  }
  return send({
    approvals: result.data,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
}

async function createApproval(request, env, user, threadId, send) {
  if (!isUuid(threadId)) return send({ error: "thread_not_found" }, 404);
  const parsed = await readJsonObject(request, 8000);
  if (!parsed.ok) return send({ error: parsed.error }, parsed.status);
  if (!exactKeys(parsed.value, ["requestType", "proposal"], ["requestType", "proposal"])) {
    return send({ error: "approval_request_fields_invalid" }, 400);
  }
  if (parsed.value.requestType !== NOVA_APPROVAL_REQUEST_TYPE) {
    return send({ error: "approval_request_type_not_allowed" }, 400);
  }

  let proposal;
  try {
    proposal = normalizeStrategyDraftProposal(parsed.value.proposal);
  } catch (error) {
    return send({ error: error?.message || "approval_proposal_invalid" }, 400);
  }

  let proposalHash;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(proposal));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    proposalHash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return serviceUnavailable(send, "approval_create_unavailable");
  }

  const result = await postgrest(env, user, "/rpc/nova_create_approval", {
    method: "POST",
    body: {
      p_thread_id: threadId,
      p_request_type: NOVA_APPROVAL_REQUEST_TYPE,
      p_proposal: proposal,
      p_proposal_hash: proposalHash,
      p_policy_version: NOVA_APPROVAL_POLICY_VERSION,
      p_expires_at: new Date(Date.now() + NOVA_APPROVAL_TTL_MS).toISOString()
    }
  });
  if (!result.ok) {
    if (result.code === "23505") return send({ error: "approval_already_pending" }, 409);
    if (result.code === "P0001") return send({ error: "thread_not_found_or_not_active" }, 409);
    if (result.code === "42501") return send({ error: "authentication_required" }, 401);
    if (result.code === "22023") return send({ error: "approval_proposal_invalid" }, 400);
    return serviceUnavailable(send, "approval_create_unavailable");
  }

  const approval = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!approval?.id || approval.status !== "pending") {
    return serviceUnavailable(send, "approval_create_unavailable");
  }
  return send({
    approval,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerMutationEnabled: false
  }, 201);
}

async function resolveApproval(request, env, user, approvalId, send) {
  if (!isUuid(approvalId)) return send({ error: "approval_not_found" }, 404);
  const parsed = await readJsonObject(request, 8000);
  if (!parsed.ok) return send({ error: parsed.error }, parsed.status);

  let decision;
  try {
    decision = normalizeApprovalDecision(parsed.value);
  } catch (error) {
    return send({ error: error?.message || "approval_decision_invalid" }, 400);
  }

  const result = await postgrest(env, user, "/rpc/nova_resolve_approval", {
    method: "POST",
    body: {
      p_approval_id: approvalId,
      p_decision: decision.decision,
      p_decision_note: decision.note,
      p_decision_payload: decision.editedProposal,
      p_policy_version: NOVA_APPROVAL_POLICY_VERSION
    }
  });
  if (!result.ok) {
    if (result.code === "42501") return send({ error: "authentication_required" }, 401);
    if (result.code === "22023") return send({ error: "approval_decision_invalid" }, 400);
    return serviceUnavailable(send, "approval_decision_unavailable");
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.result_code) return serviceUnavailable(send, "approval_decision_unavailable");
  const failures = {
    not_found: ["approval_not_found", 404],
    invalid_nonce: ["approval_decision_invalid", 403],
    already_resolved: ["approval_already_resolved", 409],
    expired: ["approval_expired", 410],
    policy_mismatch: ["approval_policy_stale", 409],
    invalid_decision: ["approval_decision_invalid", 400]
  };
  const failure = failures[row.result_code];
  if (failure) {
    return send({
      error: failure[0],
      status: row.status || undefined,
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false
    }, failure[1]);
  }
  if (row.result_code !== "resolved") {
    return serviceUnavailable(send, "approval_decision_unavailable");
  }

  return send({
    approval: {
      id: row.request_id,
      thread_id: row.thread_id,
      status: row.status,
      decided_at: row.decided_at,
      decision_payload: row.decision_payload
    },
    message: row.status === "approved"
      ? "Draft review accepted. No Agent graph resume or broker/account action was performed."
      : row.status === "rejected"
        ? "Draft review rejected. No Agent graph resume or broker/account action was performed."
        : "Draft revision saved. It is not approved; submit the revision for a new review.",
    agentGraphResumeEnabled: false,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerMutationEnabled: false
  });
}

export async function handleAgentApprovalRequest(request, env, user, send) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/v1/agent/threads") {
    if (request.method === "GET") return listThreads(request, env, user, send);
    if (request.method === "POST") return createThread(request, env, user, send);
    return send({ error: "method_not_allowed" }, 405);
  }

  const threadMatch = /^\/v1\/agent\/threads\/([^/]+)\/approvals$/.exec(path);
  if (threadMatch) {
    if (request.method === "GET") return listApprovals(env, user, threadMatch[1], send);
    if (request.method === "POST") return createApproval(request, env, user, threadMatch[1], send);
    return send({ error: "method_not_allowed" }, 405);
  }

  const decisionMatch = /^\/v1\/agent\/approvals\/([^/]+)\/decision$/.exec(path);
  if (decisionMatch) {
    if (request.method !== "POST") return send({ error: "method_not_allowed" }, 405);
    return resolveApproval(request, env, user, decisionMatch[1], send);
  }

  return send({ error: "not_found" }, 404);
}
