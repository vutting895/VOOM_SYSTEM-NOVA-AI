import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  NOVA_APPROVAL_POLICY_VERSION,
  NOVA_APPROVAL_REQUEST_TYPE,
  hashStrategyDraftProposal,
  isUuid,
  normalizeApprovalDecision,
  normalizeStrategyDraftProposal,
} from "./nova-approval-contract.mjs";

const NO_STORE = { "Cache-Control": "no-store" };
const JSON_BODY = express.json({ limit: "16kb", strict: true });

function sendError(res, status, error, extra = {}) {
  return res.status(status).set(NO_STORE).json({ ok: false, error, ...extra });
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

async function authenticateAgentRequest(req, res, next) {
  res.set(NO_STORE);
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return sendError(res, 401, "authentication_required");

  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return sendError(res, 503, "approval_service_not_configured");

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: "Bearer " + match[1] },
      },
    });
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user?.id) return sendError(res, 401, "authentication_invalid");
    req.novaApproval = { supabase, user: data.user };
    return next();
  } catch {
    return sendError(res, 401, "authentication_invalid");
  }
}

function requireApprovalsEnabled(_req, res, next) {
  if (process.env.NOVA_APPROVALS_ENABLED !== "true") {
    return sendError(res, 503, "approval_workflow_disabled", {
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerMutationEnabled: false,
    });
  }
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function singleRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function findOwnedThread(supabase, threadId, userId) {
  const { data, error } = await supabase
    .from("nova_agent_threads")
    .select("id,user_id,title,state,policy_version,created_at,updated_at,last_activity_at")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findOwnedApproval(supabase, approvalId, userId) {
  const { data, error } = await supabase
    .from("nova_approval_requests")
    .select("id,thread_id,user_id,request_type,proposal,proposal_hash,policy_version,status,decision_note,decision_payload,expires_at,created_at,updated_at,decided_at")
    .eq("id", approvalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function publicApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    requestType: row.request_type,
    proposal: row.proposal,
    proposalHash: row.proposal_hash,
    policyVersion: row.policy_version,
    status: row.status,
    decisionNote: row.decision_note,
    decisionPayload: row.decision_payload,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  };
}

function resolveStatus(resultCode) {
  return {
    not_found: ["approval_not_found", 404],
    already_resolved: ["approval_already_resolved", 409],
    expired: ["approval_expired", 410],
    policy_mismatch: ["approval_policy_mismatch", 409],
    invalid_decision: ["approval_decision_invalid", 400],
  }[resultCode] || ["approval_resolution_failed", 409];
}

export function createNovaApprovalRouter() {
  const router = express.Router();

  // Authentication and server-side feature gating run before any request body is parsed.
  router.use(authenticateAgentRequest);
  router.use(requireApprovalsEnabled);

  router.get("/threads", asyncRoute(async (req, res) => {
    const { supabase, user } = req.novaApproval;
    const { data, error } = await supabase
      .from("nova_agent_threads")
      .select("id,title,state,policy_version,created_at,updated_at,last_activity_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return sendError(res, 500, "thread_query_failed");
    return res.status(200).json({ ok: true, threads: data || [] });
  }));

  router.post("/threads", JSON_BODY, asyncRoute(async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "NOVA review";
    if (!title || title.length > 120) return sendError(res, 400, "thread_title_invalid");

    const { supabase } = req.novaApproval;
    const { data, error } = await supabase
      .from("nova_agent_threads")
      .insert({ title })
      .select("id,title,state,policy_version,created_at,updated_at,last_activity_at")
      .single();
    if (error) return sendError(res, 400, "thread_create_failed");
    return res.status(201).json({
      ok: true,
      thread: data,
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerMutationEnabled: false,
    });
  }));

  router.get("/threads/:threadId/approvals", asyncRoute(async (req, res) => {
    const { supabase, user } = req.novaApproval;
    const { threadId } = req.params;
    if (!isUuid(threadId)) return sendError(res, 400, "thread_id_invalid");
    const thread = await findOwnedThread(supabase, threadId, user.id);
    if (!thread) return sendError(res, 404, "thread_not_found");

    const { data, error } = await supabase
      .from("nova_approval_requests")
      .select("id,thread_id,request_type,proposal,proposal_hash,policy_version,status,decision_note,decision_payload,expires_at,created_at,updated_at,decided_at")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return sendError(res, 500, "approval_query_failed");
    return res.status(200).json({ ok: true, approvals: (data || []).map(publicApproval) });
  }));

  router.post("/threads/:threadId/approvals", JSON_BODY, asyncRoute(async (req, res) => {
    const { supabase, user } = req.novaApproval;
    const { threadId } = req.params;
    if (!isUuid(threadId)) return sendError(res, 400, "thread_id_invalid");
    if (req.body?.requestType !== NOVA_APPROVAL_REQUEST_TYPE) {
      return sendError(res, 400, "approval_request_type_invalid");
    }

    let proposal;
    try {
      proposal = normalizeStrategyDraftProposal(req.body?.proposal);
    } catch (error) {
      return sendError(res, 400, error instanceof Error ? error.message : "proposal_invalid");
    }

    const thread = await findOwnedThread(supabase, threadId, user.id);
    if (!thread || thread.state !== "active") {
      return sendError(res, 409, "thread_not_found_or_not_active");
    }

    const { data, error } = await supabase.rpc("nova_create_approval", {
      p_thread_id: threadId,
      p_request_type: NOVA_APPROVAL_REQUEST_TYPE,
      p_proposal: proposal,
      p_proposal_hash: hashStrategyDraftProposal(proposal),
      p_policy_version: NOVA_APPROVAL_POLICY_VERSION,
      p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) return sendError(res, 400, "approval_create_failed");
    const row = singleRow(data);
    if (!row?.id) return sendError(res, 500, "approval_create_empty_result");

    return res.status(201).json({
      ok: true,
      approval: publicApproval(row),
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerMutationEnabled: false,
    });
  }));

  router.post("/approvals/:approvalId/decision", JSON_BODY, asyncRoute(async (req, res) => {
    const { supabase, user } = req.novaApproval;
    const { approvalId } = req.params;
    if (!isUuid(approvalId)) return sendError(res, 400, "approval_id_invalid");

    let decision;
    try {
      decision = normalizeApprovalDecision(req.body);
    } catch (error) {
      return sendError(res, 400, error instanceof Error ? error.message : "decision_invalid");
    }

    const existing = await findOwnedApproval(supabase, approvalId, user.id);
    if (!existing) return sendError(res, 404, "approval_not_found");

    const { data, error } = await supabase.rpc("nova_resolve_approval", {
      p_approval_id: approvalId,
      p_decision: decision.decision,
      p_decision_note: decision.note,
      p_decision_payload: decision.editedProposal,
      p_policy_version: NOVA_APPROVAL_POLICY_VERSION,
    });
    if (error) return sendError(res, 400, "approval_resolution_failed");

    const row = singleRow(data);
    if (!row?.result_code) return sendError(res, 500, "approval_resolution_empty_result");
    if (row.result_code !== "resolved") {
      const [errorCode, status] = resolveStatus(row.result_code);
      return sendError(res, status, errorCode, {
        resultCode: row.result_code,
        approval: publicApproval({ ...existing, status: row.status || existing.status }),
      });
    }

    const refreshed = await findOwnedApproval(supabase, approvalId, user.id);
    return res.status(200).json({
      ok: true,
      approval: publicApproval(refreshed || {
        ...existing,
        status: row.status,
        decided_at: row.decided_at,
        decision_payload: row.decision_payload,
      }),
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerMutationEnabled: false,
    });
  }));

  router.get("/approvals/:approvalId/events", asyncRoute(async (req, res) => {
    const { supabase, user } = req.novaApproval;
    const { approvalId } = req.params;
    if (!isUuid(approvalId)) return sendError(res, 400, "approval_id_invalid");

    const approval = await findOwnedApproval(supabase, approvalId, user.id);
    if (!approval) return sendError(res, 404, "approval_not_found");

    const { data, error } = await supabase
      .from("nova_approval_events")
      .select("id,event_sequence,approval_id,thread_id,event_type,actor_type,actor_user_id,from_status,to_status,policy_version,proposal_hash,decision_note,decision_payload,decision_payload_hash,created_at")
      .eq("approval_id", approvalId)
      .eq("user_id", user.id)
      .order("event_sequence", { ascending: true })
      .limit(100);
    if (error) return sendError(res, 500, "approval_audit_query_failed");

    return res.status(200).json({
      ok: true,
      approvalId,
      events: data || [],
    });
  }));

  return router;
}

export function registerNovaApprovalRoutes(app) {
  app.use("/api/agent", createNovaApprovalRouter());
}

export { authenticateAgentRequest };
