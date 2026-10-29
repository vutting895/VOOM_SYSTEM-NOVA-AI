import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "ci-placeholder-not-a-secret";

const { POST } = await import("../frontend/app/api/gen-ai/generate/route.js");

async function unauthenticatedPost(body, contentType = "application/json") {
  return POST(new Request("https://unit.test/api/gen-ai/generate", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  }));
}

test("AI API rejects an unauthenticated request before validating an empty payload", async () => {
  const response = await unauthenticatedPost("{}");
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /เข้าสู่ระบบ/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("AI API rejects an unauthenticated request before validating a missing prompt", async () => {
  const response = await unauthenticatedPost(JSON.stringify({ market: "XAU/USD" }));
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /เข้าสู่ระบบ/);
});

test("AI API rejects an unauthenticated request before parsing malformed JSON", async () => {
  const response = await unauthenticatedPost("{", "application/json");
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /เข้าสู่ระบบ/);
});
