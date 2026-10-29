import {
  NOVA_APPROVAL_POLICY_VERSION,
  NOVA_APPROVAL_REQUEST_TYPE,
  NOVA_APPROVAL_TTL_MS,
  hashStrategyDraftProposal,
  normalizeStrategyDraftProposal,
} from "../../../../../../lib/agent-approval-contract.mjs";
import {
  agentApiJson,
  authenticateAgentRequest,
  isUuid,
  readAgentJson,
} from "../../../../../../lib/agent-approval-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WORKFLOW_ENABLED = process.env.NOVA_APPROVALS_ENABLED === "true";

async function getThreadId(context) {
  const params = await context.params;
  return params?.threadId;
}

export async function GET(request, context) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  if (!WORKFLOW_ENABLED) return agentApiJson({ error: "approval_workflow_disabled" }, 503);

  const threadId = await getThreadId(context);
  if (!isUuid(threadId)) return agentApiJson({ error: "thread_not_found" }, 404);

  const { data: thread, error: threadError } = await auth.supabase
    .from("nova_agent_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (threadError) return agentApiJson({ error: "approval_list_unavailable" }, 503);
  if (!thread) return agentApiJson({ error: "thread_not_found" }, 404);

  const { data, error } = await auth.supabase
    .from("nova_approval_requests")
    .select("id,thread_id,request_type,proposal,proposal_hash,policy_version,status,decision_note,decision_payload,expires_at,created_at,updated_at,decided_at")
    .eq("thread_id", threadId)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return agentApiJson({ error: "approval_list_unavailable" }, 503);

  return agentApiJson({
    approvals: data || [],
    executionEnabled: false,
    liveTradingEnabled: false,
  });
}

export async function POST(request, context) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  if (!WORKFLOW_ENABLED) return agentApiJson({ error: "approval_workflow_disabled" }, 503);

  const threadId = await getThreadId(context);
  if (!isUuid(threadId)) return agentApiJson({ error: "thread_not_found" }, 404);

  const parsed = await readAgentJson(request, 8000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (Object.keys(body).some((key) => !["requestType", "proposal"].includes(key))) {
    return agentApiJson({ error: "approval_request_fields_invalid" }, 400);
  }
  if (body.requestType !== NOVA_APPROVAL_REQUEST_TYPE) {
    return agentApiJson({ error: "approval_request_type_not_allowed" }, 400);
  }

  let proposal;
  try {
    proposal = normalizeStrategyDraftProposal(body.proposal);
  } catch (error) {
    return agentApiJson({ error: error?.message || "approval_proposal_invalid" }, 400);
  }

  const now = Date.now();
  const expiresAt = new Date(now + NOVA_APPROVAL_TTL_MS).toISOString();
  const proposalHash = hashStrategyDraftProposal(proposal);
  const { data, error } = await auth.supabase.rpc("nova_create_approval", {
    p_thread_id: threadId,
    p_request_type: NOVA_APPROVAL_REQUEST_TYPE,
    p_proposal: proposal,
    p_proposal_hash: proposalHash,
    p_policy_version: NOVA_APPROVAL_POLICY_VERSION,
    p_expires_at: expiresAt,
  });

  if (error) {
    if (error.code === "23505") {
      return agentApiJson({ error: "approval_already_pending" }, 409);
    }
    if (error.code === "P0001") {
      return agentApiJson({ error: "thread_not_found_or_not_active" }, 409);
    }
    if (error.code === "42501") {
      return agentApiJson({ error: "authentication_required" }, 401);
    }
    if (error.code === "22023") {
      return agentApiJson({ error: "approval_proposal_invalid" }, 400);
    }
    return agentApiJson({ error: "approval_create_unavailable" }, 503);
  }

  const approval = Array.isArray(data) ? data[0] : data;
  if (!approval?.id || approval.status !== "pending") {
    return agentApiJson({ error: "approval_create_unavailable" }, 503);
  }
  return agentApiJson({
    approval,
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerMutationEnabled: false,
  }, 201);
}
