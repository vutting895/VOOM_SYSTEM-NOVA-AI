import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDatasetReadiness, analyzeModelReadiness } from "../src/learning-registry.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function setup(row) {
  globalThis.fetch = async () => new Response(JSON.stringify([row]), { status: 200 });
  return {
    request: { headers: new Headers({ Authorization: "Bearer session" }) },
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key" }
  };
}

test("dataset analysis fails closed when registry evidence is incomplete", async () => {
  const { request, env } = setup({
    id: "f2d17d91-26a9-4f3c-8a7e-0d4ed0a2d302", symbol: "XAUUSDm", timeframe: "H1",
    row_count: 0, sha256: "a".repeat(64), quality_status: "passed",
    validation_status: "pending", start_at: null, end_at: null
  });
  const result = await analyzeDatasetReadiness({ dataset_id: "f2d17d91-26a9-4f3c-8a7e-0d4ed0a2d302" }, request, env);
  assert.equal(result.eligibleForDownstreamAnalysis, false);
  assert.ok(result.failedChecks.includes("manifestValidationPassed"));
  assert.ok(result.failedChecks.includes("nonEmpty"));
  assert.ok(result.failedChecks.includes("boundedUtcRangePresent"));
});

test("model analysis requires independent OOS, leakage and baseline evidence", async () => {
  const { request, env } = setup({
    id: "f2d17d91-26a9-4f3c-8a7e-0d4ed0a2d302", model_key: "hybrid", model_version: "0.1",
    lifecycle_status: "candidate", artifact_sha256: "a".repeat(64), walk_forward_status: "passed",
    oos_closed_trades: 35, evaluation: { oos_net_profit: 10, oos_profit_factor: 1.2, leakage_audit: "failed", classification_beats_baseline: false }
  });
  const result = await analyzeModelReadiness({ model_id: "f2d17d91-26a9-4f3c-8a7e-0d4ed0a2d302" }, request, env);
  assert.equal(result.eligibleForResearchPromotionReview, false);
  assert.ok(result.failedChecks.includes("explicitlyApproved"));
  assert.ok(result.failedChecks.includes("leakageAuditPassed"));
  assert.ok(result.failedChecks.includes("baselineBeaten"));
});
