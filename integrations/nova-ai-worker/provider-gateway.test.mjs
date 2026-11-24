import test from "node:test";
import assert from "node:assert/strict";
import { generateWithProviderGateway, redactProviderText } from "./provider-gateway.js";

const messages = [
  { role: "system", content: "Research only. Never execute trades." },
  { role: "user", content: "Explain EMA." },
];
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("Gemini is primary and sends the key only in the request header", async () => {
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
  assert.equal(JSON.parse(request.init.body).store, false);
  assert.equal(request.init.redirect, "error");
});

test("configured model override is validated and bounded", async () => {
  let sentModel;
  globalThis.fetch = async (_url, init) => {
    sentModel = JSON.parse(init.body).model;
    return new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "ok" }] }],
    }), { status: 200 });
  };
  await generateWithProviderGateway({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3.6-flash" }, messages);
  assert.equal(sentModel, "gemini-3.6-flash");
});

test("credential-like prompt content is redacted before provider request", async () => {
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = init.body;
    return new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "safe" }] }],
    }), { status: 200 });
  };
  const secret = "AIzaSyDUMMYKEY12345678901234567890";
  await generateWithProviderGateway({ GEMINI_API_KEY: "provider-test-key" }, [
    { role: "system", content: "Research only." },
    { role: "user", content: "api_key=" + secret + " Bearer abcdefghijklmnopqrstuvwxyz123456" },
  ]);
  assert.equal(body.includes(secret), false);
  assert.equal(body.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.match(body, /\[REDACTED\]/);
});

test("Gemini failure falls back to Cloudflare AI and reports provenance", async () => {
  globalThis.fetch = async () => new Response("private provider failure", { status: 429 });
  const result = await generateWithProviderGateway({
    GEMINI_API_KEY: "test-gemini-secret",
    AI: { run: async () => ({ response: "Cloudflare fallback" }) },
  }, messages);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackFrom, "gemini");
  assert.equal(result.text, "Cloudflare fallback");
});

test("missing Gemini key uses Cloudflare fallback without a Gemini request", async () => {
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("must not call Gemini"); };
  const result = await generateWithProviderGateway({
    AI: { run: async () => ({ response: "Cloudflare fallback" }) },
  }, messages);
  assert.equal(networkCalls, 0);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackFrom, "gemini");
});

test("both providers unavailable fails closed", async () => {
  await assert.rejects(() => generateWithProviderGateway({}, messages), /ai_provider_unavailable/);
});

test("invalid messages are rejected and credential redaction is deterministic", async () => {
  await assert.rejects(() => generateWithProviderGateway({}, []), /invalid_provider_messages/);
  assert.equal(redactProviderText("api_key=AIzaSyDUMMYKEY12345678901234567890"), "api_key=[REDACTED]");
  await assert.rejects(() => generateWithProviderGateway({}, [
    { role: "user", content: "x".repeat(12001) },
  ]), /invalid_provider_messages/);
});
