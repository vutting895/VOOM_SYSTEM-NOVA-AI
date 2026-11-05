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
    assert.equal(calls, 1);
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
