import test from "node:test";
import assert from "node:assert/strict";
import { compactChatHistory, DEFAULT_CHAT_MODEL, MODEL_RUNTIME_VERSION, ModelRuntimeError, runChatModel } from "./runtime-core.js";
import { containsCredentialLikeContent, MemoryServiceError, evaluateFeedbackRows, validateLearningFeedback, validateMemoryFact, validateMemorySettings, validateMemoryThreadTitle } from "./memory-learning.js";

test("model runtime exposes a fixed server-owned default model", () => {
  assert.equal(DEFAULT_CHAT_MODEL, "@cf/meta/llama-3.2-3b-instruct");
  assert.equal(MODEL_RUNTIME_VERSION, "nova.model-runtime.v1");
});

test("model runtime calls only the allowlisted model and returns provenance", async () => {
  const result = await runChatModel({ AI: { run: async (model, options) => {
    assert.equal(model, DEFAULT_CHAT_MODEL);
    assert.equal(options.max_tokens, 900);
    assert.equal(options.messages[0].role, "system");
    return { response: "NOVA response" };
  } } }, [{ role: "system", content: "System policy" }, { role: "user", content: "Hello" }]);
  assert.deepEqual(result, { message: "NOVA response", provider: "cloudflare-workers-ai", model: DEFAULT_CHAT_MODEL, runtimeVersion: MODEL_RUNTIME_VERSION });
});

test("model runtime rejects unavailable, unapproved and malformed model calls", async () => {
  await assert.rejects(() => runChatModel({}, [{ role: "system", content: "System" }, { role: "user", content: "Hello" }]),
    (error) => error instanceof ModelRuntimeError && error.code === "ai_unavailable");
  await assert.rejects(() => runChatModel({ NOVA_CHAT_MODEL: "browser-selected-model", AI: { run: async () => ({ response: "no" }) } },
    [{ role: "system", content: "System" }, { role: "user", content: "Hello" }]), (error) => error.code === "model_not_allowlisted");
  await assert.rejects(() => runChatModel({ AI: { run: async () => ({ response: "" }) } },
    [{ role: "system", content: "System" }, { role: "user", content: "Hello" }]), (error) => error.code === "invalid_model_response");
});

test("model runtime bounds context and fails closed on provider exceptions", async () => {
  await assert.rejects(() => runChatModel({ AI: { run: async () => "unused" } }, [
    { role: "system", content: "System" }, { role: "user", content: "x".repeat(12000) },
    { role: "assistant", content: "y".repeat(12000) },
  ]), (error) => error.code === "runtime_context_too_large");
  await assert.rejects(() => runChatModel({ AI: { run: async () => { throw new Error("provider failure"); } } },
    [{ role: "system", content: "System" }, { role: "user", content: "Hello" }]),
    (error) => error.code === "ai_provider_unavailable");
});

test("memory settings require explicit opt-in booleans and supported retention", () => {
  assert.deepEqual(validateMemorySettings({ memoryEnabled: true, feedbackEnabled: false, retentionDays: 30 }),
    { memory_enabled: true, feedback_enabled: false, retention_days: 30 });
  assert.throws(() => validateMemorySettings({ memoryEnabled: "yes", feedbackEnabled: false }),
    (error) => error instanceof MemoryServiceError && error.code === "invalid_memory_settings");
  assert.throws(() => validateMemorySettings({ memoryEnabled: true, feedbackEnabled: true, retentionDays: 14 }),
    (error) => error.code === "invalid_retention_days");
});

test("memory facts accept only bounded user-authored categories", () => {
  assert.deepEqual(validateMemoryFact({ category: "project", content: "NOVA AI" }), { category: "project", content: "NOVA AI" });
  assert.throws(() => validateMemoryFact({ category: "credential", content: "secret" }), (error) => error.code === "invalid_memory_fact");
  assert.throws(() => validateMemoryFact({ category: "preference", content: "x".repeat(501) }), (error) => error.code === "invalid_memory_fact");
});

test("learning feedback accepts only bounded ratings and UUID references", () => {
  const value = validateLearningFeedback({ responseId: "123e4567-e89b-42d3-a456-426614174000",
    threadId: "123e4567-e89b-42d3-a456-426614174001", rating: 5, category: "helpfulness",
    provider: "cloudflare-workers-ai", model: "@cf/meta/llama-3.2-3b-instruct" });
  assert.equal(value.rating, 5);
  assert.equal(value.thread_id, "123e4567-e89b-42d3-a456-426614174001");
  assert.throws(() => validateLearningFeedback({ responseId: "not-a-uuid", rating: 6, category: "helpfulness" }),
    (error) => error.code === "invalid_learning_feedback");
});

test("feedback is evaluation evidence and can never promote a model", () => {
  const report = evaluateFeedbackRows([{ rating: 5, category: "accuracy" }, { rating: 4, category: "safety" }]);
  assert.equal(report.sampleCount, 2);
  assert.equal(report.averageRating, 4.5);
  assert.equal(report.evidenceStatus, "insufficient_feedback");
  assert.equal(report.promotionEligible, false);
  assert.match(report.note, /does not train/);
  const enough = evaluateFeedbackRows(Array.from({ length: 30 }, () => ({ rating: 5, category: "helpfulness" })));
  assert.equal(enough.evidenceStatus, "feedback_sample_available");
  assert.equal(enough.promotionEligible, false);
});

test("memory history is bounded before it reaches the model context", () => {
  const messages = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user", content: String(index).repeat(2500),
  }));
  const compacted = compactChatHistory(messages);
  assert.equal(compacted.length, 6);
  assert.equal(compacted[0].content.length, 1800);
  assert.equal(compacted.at(-1).content[0], "9");
});

test("memory persistence detects common credential patterns", () => {
  assert.equal(containsCredentialLikeContent("Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345"), true);
  assert.equal(containsCredentialLikeContent("api_key=sk_test_123456789"), true);
  assert.equal(containsCredentialLikeContent("ghp_abcdefghijklmnopqrstuvwxyz123456"), true);
  assert.equal(containsCredentialLikeContent("I prefer concise Thai explanations for NOVA."), false);
});

test("memory facts and thread titles reject credential-like content", () => {
  assert.throws(() => validateMemoryFact({ category: "project", content: "api_key=sk_test_123456789" }),
    (error) => error.code === "invalid_memory_fact");
  assert.throws(() => validateMemoryThreadTitle("Bearer abcdefghijklmnopqrstuvwxyz012345"),
    (error) => error.code === "invalid_memory_thread_title");
  assert.equal(validateMemoryThreadTitle("NOVA project notes"), "NOVA project notes");
});

