import { getVideoSkillRegistry } from "./skill-registry.js";
import { createDirectorPlan } from "./video-director-intelligence.js";
import { createVideoProductionPlan } from "./video-production-planner.js";

const BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});
const PROJECT_FIELDS = "id,title,description,status,created_at,updated_at";
const JOB_FIELDS = "id,project_id,task_type,status,prompt,request,execution_mode,estimated_cost,created_at";
const TASK_TYPES = new Set(["video_generation", "video_analysis", "video_edit_export"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{12,100}$/;
const MAX_BODY_BYTES = 6000;

function allowedOrigins(env) {
  const configured = String(env.NOVA_VIDEO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set();

  for (const value of configured) {
    try {
      const parsed = new URL(value);
      // Only canonical HTTPS origins are accepted; paths, queries and HTTP origins fail closed.
      if (parsed.protocol === "https:" && parsed.origin === value) origins.add(value);
    } catch {
      // Ignore malformed allowlist entries rather than widening browser access.
    }
  }

  return origins;
}

function originAllowed(origin, env) {
  return !origin || allowedOrigins(env).has(origin);
}

function corsHeaders(origin, env) {
  const headers = { Vary: "Origin" };
  if (!origin || !allowedOrigins(env).has(origin)) return headers;
  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "300",
  };
}

function json(data, status = 200, origin = "", env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, env),
    },
  });
}

function supabaseBase(env) {
  const configured = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };

  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }

  let response;
  try {
    response = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }

  if (response.status >= 300 && response.status < 400) {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: "invalid_or_expired_session" };
  }
  if (!response.ok) {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }

  try {
    const user = await response.json();
    if (!user || typeof user.id !== "string" || !user.id) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    return { ok: true, userId: user.id, token };
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}

async function postgrest(env, auth, table, query, init = {}) {
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, error: "database_not_configured" };
  }

  const url = new URL("/rest/v1/" + table, base);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, {
      method: init.method || "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + auth.token,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: "database_redirect_rejected" };
    }
    return { ok: true, response };
  } catch {
    return { ok: false, error: "database_unavailable" };
  }
}

async function readLimitedText(request) {
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel("request_body_too_large");
        } catch {
          // The stream is already being terminated; retain the size-limit response.
        }
        return { ok: false, status: 413, error: "request_body_too_large" };
      }
      chunks.push(chunk);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Preserve the request parsing failure.
    }
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

async function readJson(request) {
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, error: "content_type_must_be_json" };
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "request_body_too_large" };
  }

  const body = await readLimitedText(request);
  if (!body.ok) return body;

  try {
    const value = JSON.parse(body.text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400, error: "json_object_required" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

async function readRows(response) {
  try {
    const payload = await response.json();
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function listProjects(env, auth, origin) {
  const result = await postgrest(env, auth, "nova_video_projects", {
    select: PROJECT_FIELDS,
    user_id: "eq." + auth.userId,
    order: "updated_at.desc",
    limit: "50",
  });
  if (!result.ok || !result.response.ok) {
    return json({ error: "video_projects_unavailable" }, 503, origin, env);
  }
  const rows = await readRows(result.response);
  if (!rows) return json({ error: "video_projects_invalid_response" }, 503, origin, env);
  return json({ projects: rows }, 200, origin, env);
}

async function createProject(request, env, auth, origin) {
  const parsed = await readJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status, origin, env);
  const body = parsed.value;

  if (Object.keys(body).some((key) => !["title", "description"].includes(key))) {
    return json({ error: "video_project_fields_invalid" }, 400, origin, env);
  }
  if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120) {
    return json({ error: "video_project_title_invalid" }, 400, origin, env);
  }
  const description = body.description === undefined ? "" : body.description;
  if (typeof description !== "string" || description.length > 2000) {
    return json({ error: "video_project_description_invalid" }, 400, origin, env);
  }

  const result = await postgrest(env, auth, "nova_video_projects", {
    select: PROJECT_FIELDS,
  }, {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: auth.userId, title: body.title.trim(), description },
  });
  if (!result.ok || !result.response.ok) {
    return json({ error: "video_project_create_unavailable" }, 503, origin, env);
  }
  const rows = await readRows(result.response);
  if (!rows?.[0]?.id) return json({ error: "video_project_create_unavailable" }, 503, origin, env);
  return json({ project: rows[0] }, 201, origin, env);
}

async function listJobs(request, env, auth, origin) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (projectId && !UUID_PATTERN.test(projectId)) {
    return json({ error: "video_project_id_invalid" }, 400, origin, env);
  }

  const query = {
    select: JOB_FIELDS,
    user_id: "eq." + auth.userId,
    order: "created_at.desc",
    limit: "50",
  };
  if (projectId) query.project_id = "eq." + projectId;

  const result = await postgrest(env, auth, "nova_video_jobs", query);
  if (!result.ok || !result.response.ok) {
    return json({ error: "video_jobs_unavailable" }, 503, origin, env);
  }
  const rows = await readRows(result.response);
  if (!rows) return json({ error: "video_jobs_invalid_response" }, 503, origin, env);
  return json({ jobs: rows, executionEnabled: false, estimatedCost: 0 }, 200, origin, env);
}

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function createJob(request, env, auth, origin) {
  const parsed = await readJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status, origin, env);
  const body = parsed.value;

  if (Object.keys(body).some((key) => !["project_id", "task_type", "prompt", "idempotency_key", "brief"].includes(key))) {
    return json({ error: "video_job_fields_invalid" }, 400, origin, env);
  }
  if (typeof body.project_id !== "string" || !UUID_PATTERN.test(body.project_id)) {
    return json({ error: "video_project_id_invalid" }, 400, origin, env);
  }
  if (!TASK_TYPES.has(body.task_type)) return json({ error: "video_task_type_invalid" }, 400, origin, env);
  if (typeof body.prompt !== "string" || body.prompt.length > 4000) {
    return json({ error: "video_prompt_invalid" }, 400, origin, env);
  }
  if (typeof body.idempotency_key !== "string" || !IDEMPOTENCY_PATTERN.test(body.idempotency_key)) {
    return json({ error: "video_idempotency_key_invalid" }, 400, origin, env);
  }

  let requestPayload = { schema_version: "nova.video-job.v1" };
  if (body.brief !== undefined) {
    if (!body.brief || typeof body.brief !== "object" || Array.isArray(body.brief)) {
      return json({ error: "video_brief_invalid" }, 400, origin, env);
    }
    const briefFields = ["title", "concept", "audience", "platform", "language", "style", "callToAction", "durationSeconds", "aspectRatio", "goal", "verifiedFacts", "mustAvoid"];
    if (Object.keys(body.brief).some((key) => !briefFields.includes(key))) {
      return json({ error: "video_brief_fields_invalid" }, 400, origin, env);
    }
    try {
      requestPayload = { schema_version: "nova.video-job.v2", director_plan: createDirectorPlan(body.brief) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "video_brief_invalid";
      const known = /^(invalid_|creative_brief_required|director_|scene_|script_|director_timeline_|video_)/.test(message);
      return json({ error: known ? message : "video_brief_invalid" }, 400, origin, env);
    }
  }

  const status = body.task_type === "video_generation"
    ? "blocked_no_free_gpu"
    : "blocked_worker_unavailable";
  const payload = {
    user_id: auth.userId,
    project_id: body.project_id,
    task_type: body.task_type,
    status,
    prompt: body.prompt,
    request: requestPayload,
    execution_mode: "free_only",
    estimated_cost: 0,
    idempotency_key: body.idempotency_key,
  };

  const result = await postgrest(env, auth, "nova_video_jobs", {
    select: JOB_FIELDS,
  }, {
    method: "POST",
    prefer: "return=representation",
    body: payload,
  });

  if (!result.ok) return json({ error: "video_job_create_unavailable" }, 503, origin, env);
  if (result.response.status === 409) {
    const existingResult = await postgrest(env, auth, "nova_video_jobs", {
      select: JOB_FIELDS,
      user_id: "eq." + auth.userId,
      idempotency_key: "eq." + body.idempotency_key,
      limit: "1",
    });
    if (!existingResult.ok || !existingResult.response.ok) {
      return json({ error: "video_job_create_unavailable" }, 503, origin, env);
    }
    const existingRows = await readRows(existingResult.response);
    const existing = existingRows?.[0];
    if (!existing) return json({ error: "video_job_create_unavailable" }, 503, origin, env);
    if (
      existing.project_id !== body.project_id ||
      existing.task_type !== body.task_type ||
      existing.prompt !== body.prompt ||
      stableJson(existing.request ?? {}) !== stableJson(requestPayload)
    ) {
      return json({ error: "video_idempotency_key_reused" }, 409, origin, env);
    }
    return json({
      job: existing,
      executionEnabled: false,
      estimatedCost: 0,
      idempotentReplay: true,
    }, 200, origin, env);
  }

  if (!result.response.ok) return json({ error: "video_job_create_unavailable" }, 503, origin, env);
  const rows = await readRows(result.response);
  if (!rows?.[0]?.id) return json({ error: "video_job_create_unavailable" }, 503, origin, env);
  return json({
    job: rows[0],
    executionEnabled: false,
    estimatedCost: 0,
    explanation: status === "blocked_no_free_gpu"
      ? "No verified zero-cost GPU is available; generation remains blocked."
      : "No video worker is deployed; this request is recorded but not executed.",
  }, 202, origin, env);
}

async function createDirectorPlanResponse(request, origin, env) {
  const parsed = await readJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status, origin, env);
  const body = parsed.value;
  const allowedFields = ["title", "concept", "audience", "platform", "language", "style", "callToAction", "durationSeconds", "aspectRatio", "goal", "verifiedFacts", "mustAvoid"];
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    return json({ error: "video_plan_fields_invalid" }, 400, origin, env);
  }
  try {
    const directorPlan = createDirectorPlan(body);
    return json({
      directorPlan,
      executionEnabled: false,
      estimatedCost: 0,
      requiresHumanApproval: true,
      explanation: "NOVA Director generated a deterministic production plan. No LLM, video model, GPU or worker was invoked.",
    }, 200, origin, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "video_plan_invalid";
    const known = /^(invalid_|creative_brief_required|director_|scene_|script_|director_timeline_|video_)/.test(message);
    return json({ error: known ? message : "video_plan_invalid" }, 400, origin, env);
  }
}


async function createProductionPlanResponse(request, origin, env) {
  const parsed = await readJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status, origin, env);
  const body = parsed.value;
  const allowedFields = ["title", "concept", "audience", "platform", "language", "style", "callToAction", "durationSeconds", "aspectRatio", "goal", "verifiedFacts", "mustAvoid"];
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    return json({ error: "video_production_plan_fields_invalid" }, 400, origin, env);
  }
  try {
    const directorPlan = createDirectorPlan(body);
    const productionPlan = createVideoProductionPlan(directorPlan);
    return json({
      productionPlan,
      executionEnabled: false,
      estimatedCost: 0,
      requiresHumanApproval: true,
      explanation: "NOVA Director output has been projected into per-scene Engine task contracts. GPU, provider, worker and media execution remain disabled.",
    }, 200, origin, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "video_production_plan_invalid";
    const known = /^(invalid_|creative_brief_required|director_|scene_|script_|production_plan_|video_)/.test(message);
    return json({ error: known ? message : "video_production_plan_invalid" }, 400, origin, env);
  }
}

async function handle(request, env) {
  const url = new URL(request.url);
  const match = /^\/api\/video\/(skills|projects|jobs|plan|production-plan)$/.exec(url.pathname);
  if (!match) return json({ error: "not_found" }, 404);

  const origin = request.headers.get("Origin") || "";
  if (!originAllowed(origin, env)) {
    return json({ error: "origin_not_allowed" }, 403, "", env);
  }

  const resource = match[1];
  if (request.method === "OPTIONS") {
    const methods = resource === "skills" ? "GET, OPTIONS" : "GET, POST, OPTIONS";
    return new Response(null, {
      status: 204,
      headers: {
        ...BASE_HEADERS,
        ...corsHeaders(origin, env),
        "Access-Control-Allow-Methods": methods,
      },
    });
  }

  const allowedMethods = resource === "skills" ? ["GET"] : ["GET", "POST"];
  if (!allowedMethods.includes(request.method)) {
    return json({ error: "method_not_allowed" }, 405, origin, env);
  }

  // Authenticate before reading or validating any request body.
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);

  if (resource === "skills") {
    return json(getVideoSkillRegistry(), 200, origin, env);
  }
  if (resource === "plan") {
    return request.method === "POST"
      ? createDirectorPlanResponse(request, origin, env)
      : json({ error: "method_not_allowed" }, 405, origin, env);
  }
  if (resource === "production-plan") {
    return request.method === "POST"
      ? createProductionPlanResponse(request, origin, env)
      : json({ error: "method_not_allowed" }, 405, origin, env);
  }
  if (resource === "projects") {
    return request.method === "GET"
      ? listProjects(env, auth, origin)
      : createProject(request, env, auth, origin);
  }
  return request.method === "GET"
    ? listJobs(request, env, auth, origin)
    : createJob(request, env, auth, origin);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env || {});
    } catch {
      return json({
        error: "video_api_unavailable",
        executionEnabled: false,
        estimatedCost: 0,
      }, 503, request.headers.get("Origin") || "", env || {});
    }
  },
};
