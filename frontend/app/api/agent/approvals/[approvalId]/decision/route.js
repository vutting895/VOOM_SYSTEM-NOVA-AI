import {
  NOVA_APPROVAL_POLICY_VERSION,
  normalizeApprovalDecision,
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

export async function POST(request, context) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  if (!WORKFLOW_ENABLED) return agentApiJson({ error: "approval_workflow_disabled" }, 503);

  const params = await context.params;
  const approvalId = params?.approvalId;
  if (!isUuid(approvalId)) return agentApiJson({ error: "approval_not_found" }, 404);

  const parsed = await readAgentJson(request, 8000);
  if (!parsed.ok) return parsed.response;

  let decision;
  try {
    decision = normalizeApprovalDecision(parsed.value);
  } catch (error) {
    return agentApiJson({ error: error?.message || "approval_decision_invalid" }, 400);
  }

  const { data, error } = await auth.supabase.rpc("nova_resolve_approval", {
    p_approval_id: approvalId,
    p_decision: decision.decision,
    p_decision_note: decision.note,
    p_decision_payload: decision.editedProposal,
    p_policy_version: NOVA_APPROVAL_POLICY_VERSION,
  });

  if (error) {
    if (error.code === "42501") return agentApiJson({ error: "authentication_required" }, 401);
    if (error.code === "22023") return agentApiJson({ error: "approval_decision_invalid" }, 400);
    return agentApiJson({ error: "approval_decision_unavailable" }, 503);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.result_code) return agentApiJson({ error: "approval_decision_unavailable" }, 503);

  const failures = {
    not_found: ["approval_not_found", 404],
    invalid_nonce: ["approval_decision_invalid", 403],
    already_resolved: ["approval_already_resolved", 409],
    expired: ["approval_expired", 410],
    policy_mismatch: ["approval_policy_stale", 409],
    invalid_decision: ["approval_decision_invalid", 400],
  };
  const failure = failures[result.result_code];
  if (failure) {
    return agentApiJson({
      error: failure[0],
      status: result.status || undefined,
      executionEnabled: false,
      liveTradingEnabled: false,
    }, failure[1]);
  }

  if (result.result_code !== "resolved") {
    return agentApiJson({ error: "approval_decision_unavailable" }, 503);
  }
  return agentApiJson({
    approval: {
      id: result.request_id,
      thread_id: result.thread_id,
      status: result.status,
      decided_at: result.decided_at,
      decision_payload: result.decision_payload,
    },
    message: result.status === "approved"
      ? "Draft review accepted. No broker or account action was performed."
      : result.status === "rejected"
        ? "Draft review rejected. No broker or account action was performed."
        : "Draft revision saved. It is not approved; submit the revision for a new review.",
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerMutationEnabled: false,
  });
}
