import test from "node:test";
import assert from "node:assert/strict";
import { generateGeminiText } from "./gemini-provider.js";
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("Gemini uses server-side key header and Interactions API without URL key", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "NOVA response" }] }] }), { status: 200 });
  };
  const result = await generateGeminiText({ GEMINI_API_KEY: "test-secret" }, { systemInstruction: "Research only", prompt: "Hello", maxOutputTokens: 300 });
  assert.equal(result, "NOVA response");
  assert.equal(captured.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(captured.init.headers["x-goog-api-key"], "test-secret");
  assert.equal(captured.url.includes("test-secret"), false);
  assert.equal(captured.init.redirect, "error");
  assert.equal(JSON.parse(captured.init.body).store, false);
});
test("missing key fails without network access", async () => {
  let called = false; globalThis.fetch = async () => { called = true; };
  await assert.rejects(() => generateGeminiText({}, { prompt: "Hello" }), /gemini_not_configured/);
  assert.equal(called, false);
});
test("provider errors do not expose response body", async () => {
  globalThis.fetch = async () => new Response("private diagnostic", { status: 429 });
  await assert.rejects(() => generateGeminiText({ GEMINI_API_KEY: "test-secret" }, { prompt: "Hello" }), (e) => e.message === "gemini_request_failed" && !e.message.includes("private"));
});
test("empty model output is rejected", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "" }] }] }), { status: 200 });
  await assert.rejects(() => generateGeminiText({ GEMINI_API_KEY: "test-secret" }, { prompt: "Hello" }), /invalid_gemini_response/);
});
