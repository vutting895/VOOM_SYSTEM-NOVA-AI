import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/202610310001_nova_video_workspace.sql", import.meta.url),
  "utf8",
);

test("video project and job tables enforce tenant ownership with RLS", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.nova_video_projects/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.nova_video_jobs/i);
  assert.match(migration, /ALTER TABLE public\.nova_video_projects ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /ALTER TABLE public\.nova_video_jobs ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
});

test("video jobs are bound to projects owned by the same user", () => {
  assert.match(migration, /FOREIGN KEY \(project_id,user_id\)[\s\S]*?REFERENCES public\.nova_video_projects\(id,user_id\)/i);
  assert.match(migration, /nova_video_projects_id_user_unique/i);
  assert.match(migration, /nova_video_jobs_project_owner_fk/i);
});

test("video job persistence enforces free-only blocked metadata and per-user idempotency", () => {
  assert.match(migration, /task_type text not null check \(task_type in \('video_generation','video_analysis','video_edit_export'\)\)/i);
  assert.match(migration, /status text not null check \(status in \('blocked_no_free_gpu','blocked_worker_unavailable'\)\)/i);
  assert.match(migration, /execution_mode text not null default 'free_only' check \(execution_mode = 'free_only'\)/i);
  assert.match(migration, /estimated_cost numeric\(12,4\) not null default 0 check \(estimated_cost = 0\)/i);
  assert.match(migration, /unique \(user_id,idempotency_key\)/i);
});

test("video tables grant authenticated users only select and insert and reject public/anon access", () => {
  assert.match(migration, /REVOKE ALL ON TABLE public\.nova_video_projects FROM public, anon, authenticated/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.nova_video_jobs FROM public, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.nova_video_projects TO authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.nova_video_jobs TO authenticated/i);
  assert.doesNotMatch(migration, /GRANT UPDATE|GRANT DELETE/i);
});
