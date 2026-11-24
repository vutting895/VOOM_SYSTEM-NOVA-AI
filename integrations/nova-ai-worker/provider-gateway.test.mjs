import test from "node:test";
import assert from "node:assert/strict";
import { generateWithProviderGateway } from "./provider-gateway.js";

const messages = [
  { role: "system", content: "Research only. Never execute trades." },
  { role: "user", content: "Explain EMA." },
];
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("Gemini is primary by default and sends key only in the header", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Gemini answer" }] }],
    }), { status: 200 });
  };
  const result = await generateWithProviderGateway({ GEMINI_API_KEY: "test-gemini-secret" }, messages);
  assert.equal(result.provider, "gemini");
  assert.equal(result.fallbackFrom, null);
  assert.equal(result.text, "Gemini answer");
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(JSON.parse(request.init.body).model, "gemini-3.8-flash");
  assert.equal(request.init.headers["x-goog-api-key"], "test-gemini-secret");
  assert.equal(request.url.includes("test-gemini-secret"), false);
  assert.equal(JSON.stringify(result).includes("test-gemini-secret"), false);
});

test("OpenAI adapter is selected only by server-side provider config", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: "OpenAI answer" } }] }), { status: 200 });
  };
  const result = await generateWithProviderGateway({
    NOVA_AI_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-secret",
  }, messages);
  assert.equal(result.provider, "openai");
  assert.equal(result.text, "OpenAI answer");
  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.init.headers.Authorization, "Bearer test-openai-secret");
  assert.equal(JSON.stringify(result).includes("test-openai-secret"), false);
});

test("Anthropic adapter is selected only by server-side provider config", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Anthropic answer" }] }), { status: 200 });
  };
  const result = await generateWithProviderGateway({
    NOVA_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-anthropic-secret",
  }, messages);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.text, "Anthropic answer");
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.init.headers["x-api-key"], "test-anthropic-secret");
  assert.equal(JSON.stringify(result).includes("test-anthropic-secret"), false);
});

test("credential-like user content is redacted before any provider receives it", async () => {
  let requestBody = "";
  globalThis.fetch = async (_url, init) => {
    requestBody = init.body;
    return new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Safe response" }] }],
    }), { status: 200 });
  };
  const secret = "AIzaSyDUMMYKEY12345678901234567890";
  await generateWithProviderGateway({ GEMINI_API_KEY: "provider-test-key" }, [
    { role: "system", content: "Research only." },
    { role: "user", content: "Please inspect this api_key=" + secret + " and Bearer abcdefghijklmnopqrstuvwxyz123456" },
  ]);
  assert.equal(requestBody.includes(secret), false);
  assert.equal(requestBody.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.match(requestBody, /\[REDACTED\]/);
});

test("failed Gemini request falls back to Cloudflare AI with provenance", async () => {
  globalThis.fetch = async () => new Response("private provider failure", { status: 429 });
  const result = await generateWithProviderGateway({
    GEMINI_API_KEY: "test-gemini-secret",
    AI: { run: async () => ({ response: "Cloudflare fallback" }) },
  }, messages);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackFrom, "gemini");
  assert.equal(result.text, "Cloudflare fallback");
});

test("missing primary key falls back to Cloudflare AI", async () => {
  let called = false;
  const result = await generateWithProviderGateway({
    AI: { run: async () => { called = true; return { response: "backup" }; } },
  }, messages);
  assert.equal(called, true);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackFrom, "gemini");
});

test("selected OpenAI failure falls back to Cloudflare AI, never Anthropic implicitly", async () => {
  globalThis.fetch = async () => new Response("private failure", { status: 500 });
  let cloudflareCalls = 0;
  const result = await generateWithProviderGateway({
    NOVA_AI_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-secret",
    ANTHROPIC_API_KEY: "must-not-be-used",
    AI: { run: async () => { cloudflareCalls++; return { response: "backup" }; } },
  }, messages);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackFrom, "openai");
  assert.equal(cloudflareCalls, 1);
});

test("provider output and input bounds are enforced", async () => {
  await assert.rejects(() => generateWithProviderGateway({}, []), /invalid_provider_messages/);
  await assert.rejects(() => generateWithProviderGateway({
    AI: { run: async () => ({ response: "x".repeat(10001) }) },
  }, messages), /ai_provider_unavailable/);
});
