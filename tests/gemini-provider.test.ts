import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeminiProvider, GeminiProviderError } from "../server/ai/geminiProvider.ts";

test("fails closed when the server-side Gemini key is absent or a placeholder", () => {
  assert.equal(createGeminiProvider({ apiKey: "" }), null);
  assert.equal(createGeminiProvider({ apiKey: "MY_GEMINI_API_KEY" }), null);
});

test("uses a server-owned model allowlist and returns provider text", async () => {
  let captured: any;
  const provider = createGeminiProvider({
    apiKey: "test-only-not-a-real-key",
    clientFactory: () => ({
      models: {
        generateContent: async (input) => {
          captured = input;
          return { text: "analysis result" };
        },
      },
    }),
  });
  assert.ok(provider);
  const result = await provider.generateText({ task: "market_analysis", contents: "Analyze XAUUSDm" });
  assert.equal(captured.model, "gemini-3.8-flash");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.text, "analysis result");
});

test("rejects unsupported tasks and oversized inputs before provider invocation", async () => {
  let calls = 0;
  const provider = createGeminiProvider({
    apiKey: "test-only-not-a-real-key",
    clientFactory: () => ({ models: { generateContent: async () => { calls += 1; return { text: "x" }; } } }),
  });
  assert.ok(provider);
  await assert.rejects(
    provider.generateText({ task: "arbitrary-model" as any, contents: "hello" }),
    TypeError,
  );
  await assert.rejects(
    provider.generateText({ task: "chat", contents: "x".repeat(24_001) }),
    TypeError,
  );
  assert.equal(calls, 0);
});

test("redacts raw provider exceptions behind a stable error", async () => {
  const provider = createGeminiProvider({
    apiKey: "test-only-not-a-real-key",
    clientFactory: () => ({
      models: { generateContent: async () => { throw new Error("secret=must-not-leak"); } },
    }),
  });
  assert.ok(provider);
  await assert.rejects(
    provider.generateText({ task: "chat", contents: "hello" }),
    (error: unknown) => error instanceof GeminiProviderError && !error.message.includes("must-not-leak"),
  );
});
