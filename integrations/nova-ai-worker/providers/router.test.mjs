import test from "node:test";
import assert from "node:assert/strict";
import { routeChat, providerStatus } from "./router.js";
import { ProviderError } from "./errors.js";

const messages = [{ role: "user", content: "Hello" }];

test("Gemini is preferred and returns provider attribution", async () => {
  const result = await routeChat({ GEMINI_API_KEY: "test", GEMINI_FREE_TIER_CONFIRMED: "true", AI: { run() {} }, CLOUDFLARE_AI_FREE_TIER_CONFIRMED: "true", GROQ_API_KEY: "test", GROQ_FREE_TIER_CONFIRMED: "true" }, messages, {
    gemini: async () => ({ message: "hello", provider: "gemini", model: "test-model" }),
    cloudflare: async () => { throw new Error("must not run"); },
  });
  assert.equal(result.provider, "gemini");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.attempts, 1);
});

test("transient Gemini failure falls back to Cloudflare", async () => {
  const result = await routeChat({ GEMINI_API_KEY: "test", GEMINI_FREE_TIER_CONFIRMED: "true", AI: { run() {} }, CLOUDFLARE_AI_FREE_TIER_CONFIRMED: "true" }, messages, {
    gemini: async () => { throw new ProviderError("gemini", "provider_timeout", 504, true); },
    cloudflare: async () => ({ message: "fallback", provider: "cloudflare-workers-ai", model: "test" }),
  });
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.attempts, 2);
});

test("non-retryable provider auth failure does not fall through", async () => {
  let cloudflareCalled = false;
  await assert.rejects(
    routeChat({ GEMINI_API_KEY: "test", GEMINI_FREE_TIER_CONFIRMED: "true", AI: { run() {} }, CLOUDFLARE_AI_FREE_TIER_CONFIRMED: "true" }, messages, {
      gemini: async () => { throw new ProviderError("gemini", "provider_authentication_failed", 403, false); },
      cloudflare: async () => { cloudflareCalled = true; return {}; },
    }),
    (error) => error.code === "provider_authentication_failed",
  );
  assert.equal(cloudflareCalled, false);
});

test("429 is retryable and advances to the next configured provider", async () => {
  const result = await routeChat({ GEMINI_API_KEY: "test", GEMINI_FREE_TIER_CONFIRMED: "true", GROQ_API_KEY: "test", GROQ_FREE_TIER_CONFIRMED: "true" }, messages, {
    gemini: async () => { throw new ProviderError("gemini", "provider_rate_limited", 429, true); },
    groq: async () => ({ message: "groq", provider: "groq", model: "test" }),
  });
  assert.equal(result.provider, "groq");
  assert.equal(result.fallbackUsed, true);
});

test("router fails closed when no providers are configured", async () => {
  await assert.rejects(routeChat({}, messages), (error) => error.code === "no_free_provider_confirmed");
});

test("provider status exposes readiness booleans but never secret values", () => {
  const status = providerStatus({ GEMINI_API_KEY: "secret-gemini", GEMINI_FREE_TIER_CONFIRMED: "true", GROQ_API_KEY: "secret-groq", GROQ_FREE_TIER_CONFIRMED: "true" });
  const serialized = JSON.stringify(status);
  assert.equal(status.configured.gemini, true);
  assert.equal(status.configured.groq, true);
  assert.equal(status.configured.cloudflare, false);
  assert.equal(serialized.includes("secret-gemini"), false);
  assert.equal(serialized.includes("secret-groq"), false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.liveTradingEnabled, false);
});

test("provider keys alone never enable calls without explicit free-tier confirmation", async () => {
  const status = providerStatus({ GEMINI_API_KEY: "key", GROQ_API_KEY: "key", AI: { run() {} } });
  assert.deepEqual(status.enabled, { gemini: false, cloudflare: false, groq: false });
  await assert.rejects(routeChat({ GEMINI_API_KEY: "key" }, messages), (error) => error.code === "no_free_provider_confirmed");
});

test("safety blocks do not fall through to another provider", async () => {
  let cloudflareCalled = false;
  await assert.rejects(
    routeChat({ GEMINI_API_KEY: "test", GEMINI_FREE_TIER_CONFIRMED: "true", AI: { run() {} }, CLOUDFLARE_AI_FREE_TIER_CONFIRMED: "true" }, messages, {
      gemini: async () => { throw new ProviderError("gemini", "provider_safety_block", 400, false); },
      cloudflare: async () => { cloudflareCalled = true; return { message: "not allowed" }; },
    }),
    (error) => error.code === "provider_safety_block",
  );
  assert.equal(cloudflareCalled, false);
});
