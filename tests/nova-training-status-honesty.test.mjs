import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');
const server = read('server.ts');
const settings = read('src/components/SystemSettingsView.tsx');

test('training endpoints fail closed until a real training runtime is configured', () => {
  const statusRoute = server.slice(
    server.indexOf("app.get('/api/auto-train/status'"),
    server.indexOf("app.get('/api/mt5-bridge/status'")
  );
  const triggerRoute = server.slice(
    server.indexOf("app.post('/api/auto-train/trigger'"),
    server.indexOf("app.get('/api/mt5-bridge/status'")
  );

  assert.match(statusRoute, /status\(503\)/);
  assert.match(triggerRoute, /status\(503\)/);
  assert.match(server, /TRAINING_RUNTIME_NOT_CONFIGURED/);
  assert.match(server, /available: false/);
});

test('training status does not manufacture epoch, sample, accuracy, or completion metrics', () => {
  const statusStart = server.indexOf('const trainingUnavailable = {');
  const statusEnd = server.indexOf("app.get('/api/auto-train/status'", statusStart);
  const payload = server.slice(statusStart, statusEnd);

  assert.match(payload, /epoch: null/);
  assert.match(payload, /samplesIngested: null/);
  assert.match(payload, /validationAccuracyPct: null/);
  assert.match(payload, /lastTrainedAt: null/);
  assert.doesNotMatch(server, /autoTrainEpoch|autoTrainSamples|lastValidationAcc|runBackendTrainingCycle/);
  assert.doesNotMatch(server, /setInterval\([^\n]*runBackendTrainingCycle/);
});

test('settings UI never reports training success when the runtime is unavailable', () => {
  const start = settings.indexOf('function handleTriggerBackendTrain(symbol: string)');
  const end = settings.indexOf('\n  const activeProvider =', start);
  const handler = settings.slice(start, end);

  assert.match(handler, /response\.ok/);
  assert.match(handler, /data\?\.available === true/);
  assert.doesNotMatch(handler, /เทรนโมเดล .*เรียบร้อยแล้ว/);
  assert.match(handler, /ไม่มีการยืนยันว่ามีการฝึกโมเดล/);
});

test('Learning Universe never reports unverified feature-store or model metrics', () => {
  const start = server.indexOf("app.get('/api/learning/universe'");
  const end = server.indexOf('// Hybrid Architecture Endpoint:', start);
  const route = server.slice(start, end);

  assert.match(route, /status\(503\)/);
  assert.match(route, /available: false/);
  assert.match(route, /LEARNING_DATA_RUNTIME_NOT_CONFIGURED/);
  assert.doesNotMatch(route, /accuracyPct:|f1Score:|sampleCount:|totalSamplesStored:/);
});

test('quant training placeholder cannot emit a fabricated checkpoint or loss', () => {
  const training = read('workers/quant_engine/training.py');
  assert.match(training, /raise NotImplementedError/);
  assert.match(training, /TRAINING_RUNTIME_NOT_IMPLEMENTED/);
  assert.doesNotMatch(training, /mock-checkpoint-bytes|best_validation_loss=0\.15/);
});

test('Google Drive export lists and previews only actual remote file content', () => {
  const drive = read('src/components/workspace/GoogleWorkspaceExportView.tsx');
  assert.match(drive, /Google Drive file listing failed/);
  assert.match(drive, /files\(id,name,mimeType,size\)/);
  assert.match(drive, /\?alt=media/);
  assert.match(drive, /\/export\?mimeType=text\/plain/);
  assert.match(drive, /\/export\?mimeType=text\/csv/);
  assert.doesNotMatch(drive, /file-1|mnf-892147|mock requested files|Fallback sample files|BTC-USD OOS 2025-2026/);
});
