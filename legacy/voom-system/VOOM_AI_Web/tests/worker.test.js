import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
const env = {
  ASSETS: { fetch: async () => new Response("static") },
  APP_ORIGIN: "https://voom-ai-private-chat.example.workers.dev",
  SUPABASE_URL: "https://tlyyxufuiimrbaksoitf.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  VOOM_AI_ALLOWED_EMAILS: "owner@example.com",
  OPENAI_API_KEY: "test-only",
};
test("health returns only non-sensitive service status", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/api/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "voom-ai-private-chat", authentication_required_for_chat: true });
});
test("unknown API route is not found", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/api/nope"), env);
  assert.equal(response.status, 404);
});
test("chat rejects missing or untrusted Origin before provider access", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }) }), env);
  assert.equal(response.status, 403);
});
test("chat requires a valid origin and bearer session", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/api/chat", { method: "POST", headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }) }), env);
  assert.equal(response.status, 401);
});
test("session endpoint denies a verified user outside the allowlist", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "test-id", email: "other@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://example.workers.dev/api/session", { headers: { Origin: env.APP_ORIGIN, Authorization: "Bearer test-session" } }), env);
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /not on the VOOM AI access list/i);
  } finally { globalThis.fetch = oldFetch; }
});
test("session endpoint accepts a verified allowlisted email", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "test-id", email: "OWNER@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://example.workers.dev/api/session", { headers: { Origin: env.APP_ORIGIN, Authorization: "Bearer test-session" } }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authorized: true, email: "owner@example.com" });
  } finally { globalThis.fetch = oldFetch; }
});
test("static requests get anti-indexing and security headers", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});
