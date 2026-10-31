import {
  agentApiJson,
  authenticateAgentRequest,
  readAgentJson,
} from "../../../../lib/agent-approval-server.js";
import { authenticateNovaCodeServiceRequest } from "../../../../lib/nova-code-ai-service-auth.js";
import { novaCodeApiOptions, withNovaCodeCors } from "../../../../lib/nova-code-api-cors.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_IDS = new Set([
  "code_generator",
  "code_reviewer",
  "debugging_agent",
  "testing_agent",
  "security_agent",
  "devops_agent",
]);

const json = (request, body, status = 200) =>
  withNovaCodeCors(request, agentApiJson(body, status));

export async function OPTIONS(request) {
  return novaCodeApiOptions(request, ["POST", "OPTIONS"]);
}

export async function POST(request) {
  // Base44 must call from a server-side adapter using the service token.
  // Requests without the app identity retain the existing Supabase user-session path.
  const serviceAuth = authenticateNovaCodeServiceRequest(request);
  let auth;
  if (serviceAuth.attempted) {
    if (!serviceAuth.ok) return json(request, { error: serviceAuth.error }, serviceAuth.status);
    auth = serviceAuth;
  } else {
    auth = await authenticateAgentRequest(request);
    if (!auth.ok) return withNovaCodeCors(request, auth.response);
  }

  const parsed = await readAgentJson(request, 12000);
  if (!parsed.ok) return withNovaCodeCors(request, parsed.response);

  const body = parsed.value;
  const allowed = ["agent_id", "task", "repository", "base_ref", "idempotency_key"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    return json(request, { error: "nova_code_request_fields_invalid" }, 400);
  }
  if (!AGENT_IDS.has(body.agent_id)) return json(request, { error: "nova_code_agent_id_invalid" }, 400);
  if (typeof body.task !== "string" || body.task.trim().length < 10 || body.task.length > 8000) {
    return json(request, { error: "nova_code_task_invalid" }, 400);
  }
  if (body.repository !== undefined
    && (typeof body.repository !== "string" || !/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(body.repository))) {
    return json(request, { error: "nova_code_repository_invalid" }, 400);
  }
  if (body.base_ref !== undefined
    && (typeof body.base_ref !== "string" || !/^[A-Za-z0-9._/-]{1,120}$/.test(body.base_ref))) {
    return json(request, { error: "nova_code_base_ref_invalid" }, 400);
  }
  if (typeof body.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{12,100}$/.test(body.idempotency_key)) {
    return json(request, { error: "nova_code_idempotency_key_invalid" }, 400);
  }

  // Auth is implemented, but no durable job store or reviewed runtime exists yet.
  // Never accept, enqueue, execute code, access repositories, or invoke a model at this stage.
  return json(request, {
    error: "nova_code_agent_runtime_not_enabled",
    requestAccepted: false,
    agentId: body.agent_id,
    executionEnabled: false,
    estimatedCost: 0,
    requiredNextGate: "reviewed_agent_runtime_and_tenant_scoped_job_store",
  }, 503);
}
