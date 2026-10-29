import {
  agentApiJson,
  authenticateAgentRequest,
  readAgentJson,
} from "../../../../lib/agent-approval-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WORKFLOW_ENABLED = process.env.NOVA_APPROVALS_ENABLED === "true";

const POLICY_VERSION = "nova-approval.v1";

export async function GET(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  if (!WORKFLOW_ENABLED) return agentApiJson({ error: "approval_workflow_disabled" }, 503);

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state && !["active", "awaiting_review", "closed"].includes(state)) {
    return agentApiJson({ error: "thread_state_invalid" }, 400);
  }

  let query = auth.supabase
    .from("nova_agent_threads")
    .select("id,title,state,policy_version,created_at,updated_at,last_activity_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (state) query = query.eq("state", state);

  const { data, error } = await query;
  if (error) return agentApiJson({ error: "thread_list_unavailable" }, 503);
  return agentApiJson({ threads: data || [], executionEnabled: false, liveTradingEnabled: false });
}

export async function POST(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;
  if (!WORKFLOW_ENABLED) return agentApiJson({ error: "approval_workflow_disabled" }, 503);

  const parsed = await readAgentJson(request, 4000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (Object.keys(body).some((key) => key !== "title")) {
    return agentApiJson({ error: "thread_fields_invalid" }, 400);
  }

  const title = body.title === undefined ? "NOVA draft review" : body.title;
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 120) {
    return agentApiJson({ error: "thread_title_invalid" }, 400);
  }

  const { data, error } = await auth.supabase
    .from("nova_agent_threads")
    .insert({
      user_id: auth.user.id,
      title: title.trim(),
      state: "active",
      policy_version: POLICY_VERSION,
    })
    .select("id,title,state,policy_version,created_at,updated_at,last_activity_at")
    .single();

  if (error) return agentApiJson({ error: "thread_create_unavailable" }, 503);
  return agentApiJson({
    thread: data,
    executionEnabled: false,
    liveTradingEnabled: false,
  }, 201);
}
