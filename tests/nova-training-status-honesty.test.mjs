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

test('infrastructure and learning telemetry fail closed without verified sources', () => {
  const infraStart = server.indexOf("app.get('/api/infrastructure/health'");
  const learningStart = server.indexOf("app.get('/api/learning/universe'");
  const hybridStart = server.indexOf('// Hybrid Architecture Endpoint:', learningStart);
  assert.notEqual(infraStart, -1);
  assert.notEqual(learningStart, -1);
  assert.notEqual(hybridStart, -1);
  const infra = server.slice(infraStart, learningStart);
  const learning = server.slice(learningStart, hybridStart);
  assert.match(infra, /status\(503\)/);
  assert.match(infra, /INFRASTRUCTURE_TELEMETRY_NOT_CONFIGURED/);
  assert.match(infra, /liveTradingEnabled: false/);
  assert.match(infra, /mt5BridgeEnabled: false/);
  assert.doesNotMatch(infra, /latencyMs:|tickIngestionRatePerSec:|credentialsSecured: true|autoTrainEpoch/);
  assert.match(learning, /status\(503\)/);
  assert.match(learning, /LEARNING_DATA_RUNTIME_NOT_CONFIGURED/);
  assert.match(learning, /featureStore: null/);
  assert.doesNotMatch(learning, /accuracyPct:|f1Score:|sampleCount:|totalSamplesStored:/);
});
