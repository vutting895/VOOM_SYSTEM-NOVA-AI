import test from "node:test";
import assert from "node:assert/strict";
import { generateWithGemini } from "./gemini.js";
import { generateWithGroq } from "./groq.js";
import { generateWithCloudflare } from "./cloudflare.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("Gemini REST adapter sends server-side key and returns normalized response", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Gemini response" }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await generateWithGemini(
    { GEMINI_API_KEY: "server-only-key", GEMINI_MODEL: "gemini-2.5-flash" },
    [{ role: "system", content: "Research only" }, { role: "user", content: "Hello" }],
  );
  assert.equal(result.message, "Gemini response");
  assert.equal(result.provider, "gemini");
  assert.match(captured.url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(captured.init.headers["x-goog-api-key"], "server-only-key");
  assert.equal(captured.init.body.includes("server-only-key"), false);
});

test("Groq adapter accepts a namespaced default model and normalizes response", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "Groq response" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await generateWithGroq(
    { GROQ_API_KEY: "server-only-key" },
    [{ role: "user", content: "Hello" }],
  );
  assert.equal(result.message, "Groq response");
  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.equal(captured.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(captured.init.headers.Authorization, "Bearer server-only-key");
});

test("Groq adapter stops on provider safety blocks", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "content_filter", message: { content: "" } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    generateWithGroq({ GROQ_API_KEY: "server-only-key" }, [{ role: "user", content: "Hello" }]),
    (error) => error.code === "provider_safety_block" && error.retryable === false,
  );
});

test("Cloudflare adapter uses existing AI binding and returns normalized response", async () => {
  let modelSeen;
  const result = await generateWithCloudflare({
    AI: {
      run: async (model) => {
        modelSeen = model;
        return { response: "Cloudflare response" };
      },
    },
  }, [{ role: "user", content: "Hello" }]);
  assert.equal(modelSeen, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(result.message, "Cloudflare response");
  assert.equal(result.provider, "cloudflare-workers-ai");
});
