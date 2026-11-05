import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./worker.js";

const ENV = {
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  NOVA_VIDEO_ALLOWED_ORIGINS: "https://creator.example.test",
};
const ORIGIN = "https://creator.example.test";
const SESSION = "user-session-token";

function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Request("https://video-worker.example.test" + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function authResponse(status = 200) {
  return new Response(JSON.stringify(status === 200 ? { id: "user-a" } : { error: "invalid" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("rejects missing and invalid sessions before reading a request body", async () => {
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; return authResponse(); };
  try {
    const response = await worker.fetch(request("/api/video/projects", {
      method: "POST",
      body: { title: "Project" },
    }), ENV);
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("caps streamed request bodies even without a Content-Length header", async () => {
  const previous = globalThis.fetch;
  let providerCalls = 0;
  let streamCancelled = false;
  globalThis.fetch = async (input) => {
    providerCalls += 1;
    assert.equal(new URL(input).pathname, "/auth/v1/user");
    return authResponse();
  };

  const oversizedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6001).fill(0x20));
    },
    cancel() {
      streamCancelled = true;
    },
  });
  const oversizedRequest = new Request("https://video-worker.example.test/api/video/projects", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer " + SESSION,
      "Content-Type": "application/json",
    },
    body: oversizedBody,
    duplex: "half",
  });

  try {
    assert.equal(oversizedRequest.headers.get("Content-Length"), null);
    const response = await worker.fetch(oversizedRequest, ENV);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "request_body_too_large" });
    assert.equal(streamCancelled, true);
    assert.equal(providerCalls, 1, "oversized body must be rejected before any database request");
  } finally {
    globalThis.fetch = previous;
  }
});

test("CORS allows only the configured exact frontend origin", async () => {
  const allow = await worker.fetch(request("/api/video/projects", {
    method: "OPTIONS",
    headers: { Origin: ORIGIN },
  }), ENV);
  assert.equal(allow.status, 204);
  assert.equal(allow.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(allow.headers.get("Access-Control-Allow-Headers"), /Authorization/);

  const deny = await worker.fetch(request("/api/video/projects", {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example.test" },
  }), ENV);
  assert.equal(deny.status, 403);
  assert.equal(deny.headers.get("Access-Control-Allow-Origin"), null);
});

test("authenticated skills catalog returns 22 free-only, non-executable skills", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(new URL(input).pathname, "/auth/v1/user");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    return authResponse();
  };
  try {
    const response = await worker.fetch(request("/api/video/skills", {
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
    }), ENV);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.skillCount, 22);
    assert.equal(data.policy.executionEnabled, false);
    assert.equal(data.policy.paidApiAllowed, false);
    assert.equal(data.skillGroups.reduce((n, group) => n + group.skills.length, 0), 22);
    for (const group of data.skillGroups) {
      for (const skill of group.skills) {
        assert.equal(skill.executionEnabled, false);
        assert.equal(skill.estimatedCost, 0);
      }
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("project listing uses the caller bearer token and owner filter", async () => {
  const previous = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    seen.push({ url, init });
    if (url.pathname === "/auth/v1/user") return authResponse();
    assert.equal(url.pathname, "/rest/v1/nova_video_projects");
    assert.equal(url.searchParams.get("user_id"), "eq.user-a");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    return Response.json([{ id: "project-a", title: "Demo", status: "active" }]);
  };
  try {
    const response = await worker.fetch(request("/api/video/projects", {
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
    }), ENV);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.projects[0].id, "project-a");
    assert.equal(seen.length, 2);
  } finally {
    globalThis.fetch = previous;
  }
});

test("job creation records blocked zero-cost metadata and never dispatches work", async () => {
  const previous = globalThis.fetch;
  let inserted;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    assert.equal(url.pathname, "/rest/v1/nova_video_jobs");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    inserted = JSON.parse(init.body);
    return Response.json([{
      id: "job-a",
      project_id: inserted.project_id,
      task_type: inserted.task_type,
      status: inserted.status,
      prompt: inserted.prompt,
      execution_mode: inserted.execution_mode,
      estimated_cost: inserted.estimated_cost,
      created_at: "2026-11-04T00:00:00Z",
    }], { status: 201 });
  };
  try {
    const response = await worker.fetch(request("/api/video/jobs", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        project_id: "123e4567-e89b-42d3-a456-426614174000",
        task_type: "video_generation",
        prompt: "Create a short sample clip",
        idempotency_key: "request-key-123",
      },
    }), ENV);
    assert.equal(response.status, 202);
    const data = await response.json();
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
    assert.equal(data.job.status, "blocked_no_free_gpu");
    assert.equal(inserted.execution_mode, "free_only");
    assert.equal(inserted.estimated_cost, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("job creation rejects invalid task types and extra fields without database writes", async () => {
  const previous = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (input) => {
    if (new URL(input).pathname === "/auth/v1/user") return authResponse();
    writes += 1;
    return Response.json([]);
  };
  try {
    const response = await worker.fetch(request("/api/video/jobs", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        project_id: "123e4567-e89b-42d3-a456-426614174000",
        task_type: "live_execution",
        prompt: "not allowed",
        idempotency_key: "request-key-123",
        execute: true,
      },
    }), ENV);
    assert.equal(response.status, 400);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("Worker contract contains no service-role credential path or media execution", () => {
  const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /service_role|SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(source, /dispatchWorker|invokeModel|generateVideo|uploadMedia/i);
  assert.match(source, /executionEnabled: false/);
  assert.match(source, /estimated_cost: 0/);
});

test("Worker dev URL stays disabled until reviewed staging publication", () => {
  const config = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /^workers_dev\s*=\s*false\s*$/m);
  assert.doesNotMatch(config, /^workers_dev\s*=\s*true\s*$/m);
});

test("CORS allowlist rejects HTTP origins and URL values that are not canonical origins", async () => {
  const invalidEnv = {
    ...ENV,
    NOVA_VIDEO_ALLOWED_ORIGINS: "http://creator.example.test,https://creator.example.test/path",
  };

  const insecure = await worker.fetch(request("/api/video/projects", {
    method: "OPTIONS",
    headers: { Origin: "http://creator.example.test" },
  }), invalidEnv);
  assert.equal(insecure.status, 403);

  const withPath = await worker.fetch(request("/api/video/projects", {
    method: "OPTIONS",
    headers: { Origin: "https://creator.example.test/path" },
  }), invalidEnv);
  assert.equal(withPath.status, 403);
});

test("authenticated NOVA Director planning returns a frame-accurate plan without model or database calls", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(new URL(input).pathname, "/auth/v1/user");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    return authResponse();
  };
  try {
    const response = await worker.fetch(request("/api/video/plan", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        title: "NOVA Product Film",
        concept: "A premium coffee cup on a quiet morning table",
        durationSeconds: 15,
        aspectRatio: "9:16",
        goal: "product_ad",
        language: "th",
        verifiedFacts: ["Ceramic body"],
      },
    }), ENV);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
    assert.equal(data.requiresHumanApproval, true);
    assert.equal(data.directorPlan.generatedBy, "nova-owned-director-rules");
    assert.equal(data.directorPlan.frameRate, 24);
    assert.equal(data.directorPlan.totalFrames, 360);
    assert.equal(data.directorPlan.scenes.length, 3);
    assert.equal(data.directorPlan.scenes.reduce((sum, scene) => sum + scene.frameCount, 0), 360);
    assert.equal(data.directorPlan.scenes[0].beat, "hook");
    assert.match(data.directorPlan.scenes[0].visualPrompt, /Use only these supplied facts when a factual claim is needed: Ceramic body/);
    assert.equal(calls, 1, "only Supabase Auth is called; no DB, LLM, model or worker call is made");
  } finally {
    globalThis.fetch = previous;
  }
});

test("Director planning rejects unknown fields and invalid duration without database writes", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return authResponse(); };
  try {
    const headers = { Origin: ORIGIN, Authorization: "Bearer " + SESSION };
    const base = { title: "Demo", concept: "A simple product film", durationSeconds: 15 };
    const extra = await worker.fetch(request("/api/video/plan", {
      method: "POST", headers, body: { ...base, execute: true },
    }), ENV);
    assert.equal(extra.status, 400);
    assert.deepEqual(await extra.json(), { error: "video_plan_fields_invalid" });
    const long = await worker.fetch(request("/api/video/plan", {
      method: "POST", headers, body: { ...base, durationSeconds: 90 },
    }), ENV);
    assert.equal(long.status, 400);
    assert.equal((await long.json()).error, "director_plan_max_duration_60_seconds");
    assert.equal(calls, 2, "only authentication requests occurred; no database write was attempted");
  } finally {
    globalThis.fetch = previous;
  }
});

test("Director planning authenticates before reading a request body", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return authResponse(); };
  try {
    const response = await worker.fetch(request("/api/video/plan", {
      method: "POST", body: { title: "Demo", concept: "Concept" },
    }), ENV);
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("Worker exposes plan as POST-only and keeps the engine non-executable", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => authResponse();
  try {
    const getResponse = await worker.fetch(request("/api/video/plan", {
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
    }), ENV);
    assert.equal(getResponse.status, 405);
  } finally {
    globalThis.fetch = previous;
  }
  const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.match(source, /createDirectorPlan\(body\)/);
  assert.doesNotMatch(source, /dispatchWorker|invokeModel|generateVideo|uploadMedia/i);
});

test("job creation persists the NOVA Director plan in the owner-scoped job request", async () => {
  const previous = globalThis.fetch;
  let inserted;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    assert.equal(url.pathname, "/rest/v1/nova_video_jobs");
    inserted = JSON.parse(init.body);
    return Response.json([{
      id: "job-with-plan",
      project_id: inserted.project_id,
      task_type: inserted.task_type,
      status: inserted.status,
      prompt: inserted.prompt,
      request: inserted.request,
      execution_mode: inserted.execution_mode,
      estimated_cost: inserted.estimated_cost,
      created_at: "2026-11-05T00:00:00Z",
    }], { status: 201 });
  };
  try {
    const response = await worker.fetch(request("/api/video/jobs", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        project_id: "123e4567-e89b-42d3-a456-426614174000",
        task_type: "video_generation",
        prompt: "Create the reviewed NOVA product film",
        idempotency_key: "director-job-key-01",
        brief: {
          title: "NOVA Product Film",
          concept: "A premium coffee cup on a quiet morning table",
          durationSeconds: 15,
          aspectRatio: "9:16",
          goal: "product_ad",
        },
      },
    }), ENV);
    assert.equal(response.status, 202);
    assert.equal(inserted.request.schema_version, "nova.video-job.v2");
    assert.equal(inserted.request.director_plan.generatedBy, "nova-owned-director-rules");
    assert.equal(inserted.request.director_plan.totalFrames, 360);
    assert.equal(inserted.request.director_plan.scenes.length, 3);
    const data = await response.json();
    assert.equal(data.job.request.director_plan.totalFrames, 360);
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("job idempotency detects a different Director brief even when prompt and project match", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    calls += 1;
    if (init.method === "POST") return new Response(JSON.stringify({ code: "23505" }), { status: 409 });
    const existingPlan = {
      generatedBy: "nova-owned-director-rules",
      totalFrames: 360,
      title: "Different existing concept",
    };
    return Response.json([{
      id: "existing-job",
      project_id: "123e4567-e89b-42d3-a456-426614174000",
      task_type: "video_generation",
      prompt: "Same prompt",
      request: { schema_version: "nova.video-job.v2", director_plan: existingPlan },
    }]);
  };
  try {
    const response = await worker.fetch(request("/api/video/jobs", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        project_id: "123e4567-e89b-42d3-a456-426614174000",
        task_type: "video_generation",
        prompt: "Same prompt",
        idempotency_key: "director-job-key-02",
        brief: {
          title: "New concept",
          concept: "A different product",
          durationSeconds: 15,
        },
      },
    }), ENV);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "video_idempotency_key_reused" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
  }
});


test("authenticated production planning projects Director scenes into Engine tasks without dispatch", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    assert.equal(new URL(input).pathname, "/auth/v1/user");
    return authResponse();
  };
  try {
    const response = await worker.fetch(request("/api/video/production-plan", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        title: "NOVA Product Film",
        concept: "A premium coffee cup on a quiet morning table",
        durationSeconds: 15,
        aspectRatio: "9:16",
        goal: "product_ad",
        language: "th",
        verifiedFacts: ["Ceramic body"],
      },
    }), ENV);
    assert.equal(response.status, 200);
    const data = await response.json();
    const plan = data.productionPlan;
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
    assert.equal(data.requiresHumanApproval, true);
    assert.equal(plan.schemaVersion, "nova.video-production-plan.v1");
    assert.equal(plan.status, "blocked_no_free_gpu");
    assert.equal(plan.generationTasks.length, 3);
    assert.equal(plan.generationTasks[0].task.schemaVersion, "nova.video-generation-task.v1");
    assert.equal(plan.generationTasks[0].task.mode, "text_to_video");
    assert.equal(plan.generationTasks[0].task.frameRate, 24);
    assert.equal(plan.generationTasks[0].task.height, 1280);
    assert.equal(plan.generationTasks[0].task.width, 704);
    assert.equal(plan.generationTasks[0].task.modelCandidate, "Wan-AI/Wan2.2-TI2V-5B");
    assert.equal(plan.generationTasks[0].task.executionEnabled, false);
    assert.equal(plan.generationTasks[0].task.estimatedCost, 0);
    assert.equal(plan.generationTasks.reduce((sum, item) => sum + item.task.frameCount, 0), 360);
    assert.equal(plan.stages.find((stage) => stage.id === "human_approval").status, "required");
    assert.ok(plan.generationTasks.every((task) => task.state === "blocked_no_free_gpu"));
    assert.equal(calls, 1, "only Supabase Auth is called; no database, provider, model, GPU or worker dispatch");
  } finally {
    globalThis.fetch = previous;
  }
});

test("production planning rejects unknown fields and requires authentication before body parsing", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return authResponse(); };
  try {
    const invalid = await worker.fetch(request("/api/video/production-plan", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: { title: "Demo", concept: "A product", durationSeconds: 15, execute: true },
    }), ENV);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "video_production_plan_fields_invalid" });
    const unauthenticated = await worker.fetch(request("/api/video/production-plan", {
      method: "POST",
      body: { title: "Demo", concept: "A product", durationSeconds: 15 },
    }), ENV);
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});


function sampleDirectorPlan() {
  const scenes = Array.from({ length: 3 }, (_, index) => ({
    sceneId: "scene-" + String(index + 1).padStart(2, "0"),
    order: index + 1,
    startFrame: index * 120,
    frameCount: 120,
    endFrameExclusive: (index + 1) * 120,
    visualPrompt: "A premium ceramic cup in soft morning light, scene " + (index + 1),
    negativePrompt: "watermark, text",
    sourceImagePath: null,
  }));
  return {
    schemaVersion: "nova.director-plan.v1",
    plannerVersion: "1.0.0",
    title: "NOVA Approval Sample",
    aspectRatio: "9:16",
    frameRate: 24,
    totalFrames: 360,
    scenes,
  };
}


test("preparation persists an immutable server-derived Engine snapshot for the owning user", async () => {
  const previous = globalThis.fetch;
  const job = {
    id: "123e4567-e89b-42d3-a456-426614174001",
    project_id: "123e4567-e89b-42d3-a456-426614174000",
    task_type: "video_generation",
    status: "blocked_no_free_gpu",
    prompt: "NOVA demo",
    request: { schema_version: "nova.video-job.v2", director_plan: sampleDirectorPlan() },
    execution_mode: "free_only",
    estimated_cost: 0,
    created_at: "2026-11-05T00:00:00Z",
  };
  let inserted = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    if (url.pathname === "/rest/v1/nova_video_jobs") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      assert.equal(url.searchParams.get("id"), "eq." + job.id);
      assert.equal(init.method, "GET");
      return Response.json([job]);
    }
    if (url.pathname === "/rest/v1/nova_video_preparations") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      if (init.method === "GET") return Response.json([]);
      assert.equal(init.method, "POST");
      inserted = JSON.parse(init.body);
      return Response.json([{
        id: "123e4567-e89b-42d3-a456-426614174002",
        ...inserted,
        created_at: "2026-11-05T00:01:00Z",
      }], { status: 201 });
    }
    throw new Error("unexpected request " + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/api/video/preparations", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: { job_id: job.id },
    }), ENV);
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
    assert.equal(data.approvalRequired, true);
    assert.equal(inserted.user_id, "user-a");
    assert.equal(inserted.job_id, job.id);
    assert.equal(inserted.snapshot.schemaVersion, "nova.video-preparation.v1");
    assert.equal(inserted.snapshot.productionPlan.generationTasks.length, 3);
    assert.equal(inserted.snapshot.policy.executionEnabled, false);
    assert.match(inserted.snapshot_hash, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("preparation endpoint refuses another user's job and never inserts a preparation", async () => {
  const previous = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    if (url.pathname === "/rest/v1/nova_video_jobs") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      return Response.json([]);
    }
    writes += 1;
    return Response.json([]);
  };
  try {
    const response = await worker.fetch(request("/api/video/preparations", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: { job_id: "123e4567-e89b-42d3-a456-426614174099" },
    }), ENV);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "video_job_not_found" });
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("approval is append-only, owner-scoped and cannot enable rendering", async () => {
  const previous = globalThis.fetch;
  const snapshot = {
    schemaVersion: "nova.video-preparation.v1",
    job: { id: "123e4567-e89b-42d3-a456-426614174001", status: "blocked_no_free_gpu" },
    productionPlan: { status: "blocked_no_free_gpu", executionEnabled: false },
    policy: { executionEnabled: false, estimatedCost: 0, executionBlockers: ["verified_zero_cost_gpu_unavailable", "worker_dispatch_disabled"] },
  };
  const snapshotHash = await (async () => {
    const stable = (value) => {
      if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
      if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
      return JSON.stringify(value);
    };
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(snapshot)));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  })();
  let inserted = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return authResponse();
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + SESSION);
    if (url.pathname === "/rest/v1/nova_video_preparations") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      return Response.json([{
        id: "123e4567-e89b-42d3-a456-426614174002",
        user_id: "user-a",
        job_id: snapshot.job.id,
        snapshot,
        snapshot_hash: snapshotHash,
        planner_version: "1.0.0",
        created_at: "2026-11-05T00:01:00Z",
      }]);
    }
    if (url.pathname === "/rest/v1/nova_video_approval_decisions") {
      assert.equal(url.searchParams.get("user_id"), "eq.user-a");
      if (init.method === "GET") return Response.json([]);
      inserted = JSON.parse(init.body);
      return Response.json([{
        id: "123e4567-e89b-42d3-a456-426614174003",
        ...inserted,
        created_at: "2026-11-05T00:02:00Z",
      }], { status: 201 });
    }
    throw new Error("unexpected request " + url.pathname);
  };
  try {
    const response = await worker.fetch(request("/api/video/preparation-decisions", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: {
        preparation_id: "123e4567-e89b-42d3-a456-426614174002",
        decision: "approved",
        decision_note: "Reviewed creative plan",
      },
    }), ENV);
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(inserted.user_id, "user-a");
    assert.equal(inserted.decision, "approved");
    assert.equal(inserted.snapshot_hash, snapshotHash);
    assert.equal(data.jobStatus, "blocked_no_free_gpu");
    assert.equal(data.executionEnabled, false);
    assert.equal(data.estimatedCost, 0);
    assert.deepEqual(data.executionBlockers, ["verified_zero_cost_gpu_unavailable", "worker_dispatch_disabled"]);
  } finally {
    globalThis.fetch = previous;
  }
});

test("approval decision rejects unknown fields and unapproved decisions", async () => {
  const previous = globalThis.fetch;
  let databaseCalls = 0;
  globalThis.fetch = async (input) => {
    if (new URL(input).pathname === "/auth/v1/user") return authResponse();
    databaseCalls += 1;
    return Response.json([]);
  };
  try {
    const response = await worker.fetch(request("/api/video/preparation-decisions", {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
      body: { preparation_id: "123e4567-e89b-42d3-a456-426614174002", decision: "execute", execute: true },
    }), ENV);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "video_approval_decision_invalid" });
    assert.equal(databaseCalls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("approval routes authenticate before parsing bodies and expose GET only for preparation lookup", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return authResponse(); };
  try {
    const unauthenticated = await worker.fetch(request("/api/video/preparations", {
      method: "POST",
      body: { job_id: "123e4567-e89b-42d3-a456-426614174001" },
    }), ENV);
    assert.equal(unauthenticated.status, 401);
    const wrongMethod = await worker.fetch(request("/api/video/preparation-decisions", {
      headers: { Origin: ORIGIN, Authorization: "Bearer " + SESSION },
    }), ENV);
    assert.equal(wrongMethod.status, 405);
    assert.equal(calls, 0, "invalid method and missing bearer are rejected without an Auth or database request");
  } finally {
    globalThis.fetch = previous;
  }
});
