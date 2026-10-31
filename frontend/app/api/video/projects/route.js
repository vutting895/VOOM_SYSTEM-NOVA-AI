import {
  agentApiJson,
  authenticateAgentRequest,
  readAgentJson,
} from "../../../../lib/agent-approval-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("nova_video_projects")
    .select("id,title,description,status,created_at,updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return agentApiJson({ error: "video_projects_unavailable" }, 503);
  return agentApiJson({ projects: data || [] });
}

export async function POST(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const parsed = await readAgentJson(request, 5000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (Object.keys(body).some((key) => !["title", "description"].includes(key))) {
    return agentApiJson({ error: "video_project_fields_invalid" }, 400);
  }
  if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120) {
    return agentApiJson({ error: "video_project_title_invalid" }, 400);
  }
  const description = body.description === undefined ? "" : body.description;
  if (typeof description !== "string" || description.length > 2000) {
    return agentApiJson({ error: "video_project_description_invalid" }, 400);
  }

  const { data, error } = await auth.supabase
    .from("nova_video_projects")
    .insert({ user_id: auth.user.id, title: body.title.trim(), description })
    .select("id,title,description,status,created_at,updated_at")
    .single();

  if (error) return agentApiJson({ error: "video_project_create_unavailable" }, 503);
  return agentApiJson({ project: data }, 201);
}
