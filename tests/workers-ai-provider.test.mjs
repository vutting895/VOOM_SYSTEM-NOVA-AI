import test from "node:test";
import assert from "node:assert/strict";
import { CloudflareWorkersAiProvider, WorkersAiProviderError } from "../src/ai/providers/cloudflareWorkersAiProvider.ts";

const ACCOUNT_ID = "6f0a0e1c0de31d49e2b5cae66b64b481";
const TOKEN = "test-token";
const request = {
  messages: [{ role: "user", content: "ตอบภาษาไทยสั้น ๆ" }],
  maxOutputTokens: 128,
};

function provider(fetchImpl, extra = {}) {
  return new CloudflareWorkersAiProvider({
    accountId: ACCOUNT_ID,
    apiToken: TOKEN,
    fetchImpl,
    ...extra,
  });
}

function okEnvelope(overrides = {}) {
  return {
    success: true,
    result: {
      model: "@cf/zai-org/glm-4.7-flash",
      choices: [{
        finish_reason: "stop",
        message: { content: "คำตอบทดสอบ" },
      }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
        neurons: 0.25,
      },
      ...overrides,
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("returns validated text and sanitized usage metadata", async () => {
  const fetchImpl = async (url, init) => {
    assert.match(url, /\/ai\/run\/@cf\/zai-org\/glm-4\.7-flash$/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    const sent = JSON.parse(init.body);
    assert.equal(sent.max_completion_tokens, 128);
    assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: false, clear_thinking: true });
    return jsonResponse(okEnvelope());
  };

  const result = await provider(fetchImpl).generateText(request);
  assert.equal(result.text, "คำตอบทดสอบ");
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.finishReason, "stop");
  assert.equal(result.usage.totalTokens, 20);
  assert.equal(result.usage.neurons, 0.25);
});

test("rejects truncated model output", async () => {
  const body = okEnvelope();
  body.result.choices[0].finish_reason = "length";
  await assert.rejects(
    () => provider(async () => jsonResponse(body)).generateText(request),
    (error) => error instanceof WorkersAiProviderError && error.code === "TRUNCATED",
  );
});

test("rejects empty content even when API reports success", async () => {
  const body = okEnvelope();
  body.result.choices[0].message.content = null;
  await assert.rejects(
    () => provider(async () => jsonResponse(body)).generateText(request),
    { code: "INVALID_RESPONSE" },
  );
});

test("rejects malformed response envelope", async () => {
  await assert.rejects(
    () => provider(async () => jsonResponse({ success: true, result: {} })).generateText(request),
    { code: "INVALID_RESPONSE" },
  );
});

test("maps authentication, forbidden, quota and upstream statuses", async (t) => {
  for (const [status, code] of [
    [401, "AUTHENTICATION"],
    [403, "FORBIDDEN"],
    [429, "QUOTA"],
    [503, "UPSTREAM"],
  ]) {
    await t.test(String(status), async () => {
      await assert.rejects(
        () => provider(async () => new Response("", { status })).generateText(request),
        { code },
      );
    });
  }
});

test("maps aborted request to timeout", async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

  await assert.rejects(
    () => provider(fetchImpl, { timeoutMs: 500 }).generateText(request),
    { code: "TIMEOUT" },
  );
});

test("keeps timeout active while reading the response body", async () => {
  const fetchImpl = async (_url, init) => ({
    status: 200,
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("body read aborted")), { once: true });
    }),
  });

  await assert.rejects(
    () => provider(fetchImpl, { timeoutMs: 500 }).generateText(request),
    { code: "TIMEOUT" },
  );
});

test("rejects invalid message and output bounds before network call", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse(okEnvelope());
  };

  await assert.rejects(
    () => provider(fetchImpl).generateText({ messages: [], maxOutputTokens: 128 }),
    { code: "INVALID_REQUEST" },
  );
  await assert.rejects(
    () => provider(fetchImpl).generateText({ ...request, maxOutputTokens: 4096 }),
    { code: "INVALID_REQUEST" },
  );
  assert.equal(called, false);
});

test("rejects invalid configuration and non-allowlisted model", () => {
  assert.throws(
    () => new CloudflareWorkersAiProvider({ accountId: "bad", apiToken: TOKEN }),
    { code: "CONFIGURATION" },
  );
  assert.throws(
    () => new CloudflareWorkersAiProvider({
      accountId: ACCOUNT_ID,
      apiToken: TOKEN,
      model: "@cf/not-allowlisted" ,
    }),
    { code: "UNSUPPORTED_MODEL" },
  );
});

test("rejects combined prompt content above the configured bound", async () => {
  const tooLarge = {
    messages: [
      { role: "user", content: "x".repeat(16_000) },
      { role: "assistant", content: "y".repeat(16_000) },
      { role: "user", content: "z".repeat(1) },
    ],
    maxOutputTokens: 128,
  };
  await assert.rejects(
    () => provider(async () => jsonResponse(okEnvelope())).generateText(tooLarge),
    { code: "INVALID_REQUEST" },
  );
});
