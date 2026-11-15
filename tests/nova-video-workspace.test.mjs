import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202610310001_nova_video_workspace.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("video project and job tables enforce owner-scoped RLS and zero-cost requests", () => {
  assert.match(migration, /nova_video_projects ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /nova_video_jobs ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /foreign key \(project_id,user_id\)/i);
  assert.match(migration, /estimated_cost numeric\(12,4\) not null default 0 check \(estimated_cost = 0\)/i);
  assert.match(migration, /execution_mode text not null default 'free_only' check \(execution_mode = 'free_only'\)/i);
  assert.match(migration, /unique \(user_id,idempotency_key\)/i);
});

test("legacy video UI and API remain disabled in the current Vite application", () => {
  assert.doesNotMatch(server, /\/api\/video\/(?:jobs|projects)/);
  assert.doesNotMatch(app, /path=["']\/video["']|href=["']\/video["']/);
});