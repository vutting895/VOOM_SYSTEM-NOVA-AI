import {
  agentApiJson,
  authenticateAgentRequest,
  isUuid,
  readAgentJson,
} from "../../../../lib/agent-approval-server.js";
import { videoApiOptions, withVideoCors } from "../../../../lib/video-api-cors.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_TYPES = new Set(["video_generation", "video_analysis", "video_edit_export"]);
const json = (request, body, status = 200) => withVideoCors(request, agentApiJson(body, status));

export async function OPTIONS(request) {
  return videoApiOptions(request, ["GET", "POST", "OPTIONS"]);
}

export async function GET(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return withVideoCors(request, auth.response);

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (projectId && !isUuid(projectId)) {
    return json(request, { error: "video_project_id_invalid" }, 400);
  }

  let query = auth.supabase
    .from("nova_video_jobs")
    .select("id,project_id,task_type,status,prompt,execution_mode,estimated_cost,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return json(request, { error: "video_jobs_unavailable" }, 503);
  return json(request, { jobs: data || [], executionEnabled: false, estimatedCost: 0 });
}

export async function POST(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return withVideoCors(request, auth.response);

  const parsed = await readAgentJson(request, 6000);
  if (!parsed.ok) return withVideoCors(request, parsed.response);
  const body = parsed.value;
  if (Object.keys(body).some((key) => !["project_id", "task_type", "prompt", "idempotency_key"].includes(key))) {
    return json(request, { error: "video_job_fields_invalid" }, 400);
  }
  if (!isUuid(body.project_id)) return json(request, { error: "video_project_id_invalid" }, 400);
  if (!TASK_TYPES.has(body.task_type)) return json(request, { error: "video_task_type_invalid" }, 400);
  if (typeof body.prompt !== "string" || body.prompt.length > 4000) {
    return json(request, { error: "video_prompt_invalid" }, 400);
  }
  if (typeof body.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{12,100}$/.test(body.idempotency_key)) {
    return json(request, { error: "video_idempotency_key_invalid" }, 400);
  }

  // This first vertical slice records intent only. It never dispatches a worker or incurs compute.
  const status = body.task_type === "video_generation"
    ? "blocked_no_free_gpu"
    : "blocked_worker_unavailable";
  const { data, error } = await auth.supabase
    .from("nova_video_jobs")
    .insert({
      user_id: auth.user.id,
      project_id: body.project_id,
      task_type: body.task_type,
      status,
      prompt: body.prompt,
      request: { schema_version: "nova.video-job.v1" },
      execution_mode: "free_only",
      estimated_cost: 0,
      idempotency_key: body.idempotency_key,
    })
    .select("id,project_id,task_type,status,prompt,execution_mode,estimated_cost,created_at")
    .single();

  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await auth.supabase
      .from("nova_video_jobs")
      .select("id,project_id,task_type,status,prompt,execution_mode,estimated_cost,created_at")
      .eq("user_id", auth.user.id)
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();
    if (!lookupError && existing) {
      if (existing.project_id !== body.project_id
        || existing.task_type !== body.task_type
        || existing.prompt !== body.prompt) {
        return json(request, { error: "video_idempotency_key_reused" }, 409);
      }
      return json(request, { job: existing, executionEnabled: false, idempotentReplay: true }, 200);
    }
  }
  if (error) return json(request, { error: "video_job_create_unavailable" }, 503);
  return json(request, {
    job: data,
    executionEnabled: false,
    explanation: status === "blocked_no_free_gpu"
      ? "No verified zero-cost GPU is available; generation remains blocked."
      : "No CPU worker has been deployed; this request is recorded but not executed.",
  }, 202);
}
