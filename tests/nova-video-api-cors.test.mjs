import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610310001_nova_video_workspace.sql", import.meta.url), "utf8");

test("Vite runtime does not expose removed legacy Next.js video API routes", () => {
  assert.doesNotMatch(server, /app\.(?:get|post|put|patch|delete)\(['"]\/api\/video\//);
  assert.doesNotMatch(server, /\/api\/video\/(?:jobs|projects)/);
});

test("video workspace database remains owner-scoped while API runtime is disabled", () => {
  assert.match(migration, /nova_video_projects ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /nova_video_jobs ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /estimated_cost numeric\(12,4\) not null default 0 check \(estimated_cost = 0\)/i);
  assert.match(migration, /execution_mode text not null default 'free_only' check \(execution_mode = 'free_only'\)/i);
});