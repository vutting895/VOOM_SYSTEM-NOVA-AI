import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = source("../supabase/migrations/202610310001_nova_video_workspace.sql");
const projects = source("../frontend/app/api/video/projects/route.js");
const jobs = source("../frontend/app/api/video/jobs/route.js");

test("video project and job tables enforce owner-scoped RLS and zero-cost requests", () => {
  assert.match(migration, /nova_video_projects ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /nova_video_jobs ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /foreign key \(project_id,user_id\)/i);
  assert.match(migration, /estimated_cost numeric\(12,4\) not null default 0 check \(estimated_cost = 0\)/i);
  assert.match(migration, /execution_mode text not null default 'free_only' check \(execution_mode = 'free_only'\)/i);
  assert.match(migration, /unique \(user_id,idempotency_key\)/i);
});

test("project endpoints authenticate before parsing and scope reads to the owner", () => {
  for (const route of [projects]) {
    const authAt = route.indexOf("await authenticateAgentRequest(request)");
    const bodyAt = route.indexOf("await readAgentJson(request");
    assert.notEqual(authAt, -1);
    assert.ok(authAt < bodyAt);
    assert.match(route, /\.eq\("user_id", auth\.user\.id\)/);
    assert.doesNotMatch(route, /service_role|SERVICE_ROLE_KEY/i);
  }
});

test("job endpoints only record blocked free-only work and never dispatch", () => {
  const authAt = jobs.indexOf("await authenticateAgentRequest(request)");
  const bodyAt = jobs.indexOf("await readAgentJson(request");
  assert.ok(authAt !== -1 && authAt < bodyAt);
  assert.match(jobs, /blocked_no_free_gpu/);
  assert.match(jobs, /blocked_worker_unavailable/);
  assert.match(jobs, /execution_mode: "free_only"/);
  assert.match(jobs, /estimated_cost: 0/);
  assert.match(jobs, /\.eq\("user_id", auth\.user\.id\)/);
  assert.doesNotMatch(jobs, /fetch\(|dispatch|service_role|SERVICE_ROLE_KEY/i);
  assert.match(migration, /nova_video_jobs_project_owner_fk/);
});

test("job payload rejects unsupported fields, invalid IDs, tasks and idempotency keys", () => {
  assert.match(jobs, /video_job_fields_invalid/);
  assert.match(jobs, /isUuid\(body\.project_id\)/);
  assert.match(jobs, /TASK_TYPES\.has\(body\.task_type\)/);
  assert.match(jobs, /video_idempotency_key_invalid/);
});
