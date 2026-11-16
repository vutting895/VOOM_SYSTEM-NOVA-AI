import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('training status and trigger fail closed until a verified runtime exists', () => {
  const start = server.indexOf('const trainingUnavailable = {');
  const end = server.indexOf("app.get('/api/mt5-bridge/status'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = server.slice(start, end);
  assert.match(block, /TRAINING_RUNTIME_NOT_CONFIGURED/);
  assert.match(block, /available: false/);
  assert.match(block, /epoch: null/);
  assert.match(block, /samplesIngested: null/);
  assert.match(block, /validationAccuracyPct: null/);
  assert.match(block, /lastTrainedAt: null/);
  assert.match(block, /app.get\('\/api\/auto-train\/status'[\s\S]*status\(503\)/);
  assert.match(block, /app.post\('\/api\/auto-train\/trigger'[\s\S]*status\(503\)/);
  assert.doesNotMatch(block, /autoTrainEpoch|autoTrainSamples|lastValidationAcc|runBackendTrainingCycle|setInterval/);
});

test('infrastructure health never reports fabricated runtime telemetry', () => {
  const start = server.indexOf("app.get('/api/infrastructure/health'");
  const end = server.indexOf('// 5. Learning Universe & Dataset Management', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = server.slice(start, end);
  assert.match(block, /INFRASTRUCTURE_TELEMETRY_NOT_CONFIGURED/);
  assert.match(block, /status\(503\)/);
  assert.match(block, /ordersEnabled: false/);
  assert.match(block, /executionEnabled: false/);
  assert.match(block, /liveTradingEnabled: false/);
  assert.doesNotMatch(block, /latencyMs|tickIngestionRate|redisBufferHitRate|credentialsSecured|STANDBY_DEMO_READY/);
});

test('learning universe never reports synthetic dataset or model metrics', () => {
  const start = server.indexOf("app.get('/api/learning/universe'");
  const end = server.indexOf('\n  app.', start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = server.slice(start, end);
  assert.match(block, /LEARNING_UNIVERSE_NOT_CONFIGURED/);
  assert.match(block, /status\(503\)/);
  assert.match(block, /featureStore: null/);
  assert.match(block, /modelPerformanceByRegime: null/);
  assert.match(block, /trainingHistory: null/);
  assert.match(block, /autoUpdateJob: null/);
  assert.doesNotMatch(block, /totalSamplesStored|accuracyPct|f1Score|sampleCount|healthPct|SUCCESS_SYNCED/);
});

test('backtest endpoint refuses synthetic metrics until a verified runner exists', () => {
  const start = server.indexOf("app.post('/api/backtest/run'");
  const end = server.indexOf('// 4. Trading Infrastructure & Health', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = server.slice(start, end);
  assert.match(block, /BACKTEST_ENGINE_NOT_CONFIGURED/);
  assert.match(block, /status\(503\)/);
  assert.match(block, /metrics: null/);
  assert.match(block, /equityCurve: null/);
  assert.match(block, /recentTrades: null/);
  assert.doesNotMatch(block, /profitFactor|winRatePct|sharpeRatio|simulatedGain|generalizationScorePct/);
});
