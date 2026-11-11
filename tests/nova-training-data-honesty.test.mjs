import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const server = readFileSync(new URL("server.ts", root), "utf8");
const learningView = readFileSync(new URL("src/components/learning/LearningUniverseView.tsx", root), "utf8");
const intelligenceView = readFileSync(new URL("src/components/intelligence/TradingIntelligenceView.tsx", root), "utf8");

test("auto-training reports unavailable until a real training runner is connected", () => {
  assert.match(server, /mode: 'NOT_CONFIGURED'/);
  assert.match(server, /validationAccuracyPct: null/);
  assert.match(server, /samplesIngested: null/);
  assert.match(server, /training_pipeline_not_configured/);
  assert.doesNotMatch(server, /setInterval\(\(\) => \{\s*runBackendTrainingCycle/);
});

test("Learning Universe never publishes fabricated dataset or model metrics", () => {
  assert.match(server, /totalSamplesStored: 0/);
  assert.match(server, /dailyUpdateStatus: 'NOT_CONFIGURED'/);
  assert.match(server, /modelPerformanceByRegime: \[\]/);
  assert.match(server, /trainingHistory: \[\]/);
  assert.match(learningView, /No verified training runs are available/);
  assert.match(learningView, /No verified model evaluation metrics are available/);
  assert.match(learningView, /NOT CONFIGURED/);
});

test("intelligence API does not claim unverified model performance", () => {
  assert.match(server, /status: 'NOT_CONFIGURED'/);
  assert.match(server, /models: \[\]/);
  assert.match(server, /ensembleConfidencePct: null/);
  assert.match(intelligenceView, /AI Models Not Configured/);
});

test("market overview and generated candles identify sample data as unverified", () => {
  assert.match(server, /dataMode: 'STATIC_SAMPLE_UNVERIFIED'/);
  assert.match(server, /Static sample - not connected to Exness MT5/);
  assert.doesNotMatch(server, /feedSource: 'Exness MT5 Demo Terminal'/);
  assert.match(server, /dataMode: 'SIMULATED_SAMPLE_UNVERIFIED'/);
});

[executed on device: 10_0_16_116 (1b921001-c4e2-479a-8a95-7345393686dd)]