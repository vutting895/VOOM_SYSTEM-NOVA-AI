import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');

const server = read('server.ts');
const dashboard = read('src/components/dashboard/TradingDashboardView.tsx');
const settings = read('src/components/SystemSettingsView.tsx');
const backtest = read('src/components/backtest/BacktestSimulatorView.tsx');

test('market endpoints clearly classify generated values as synthetic demo data', () => {
  const overview = server.slice(server.indexOf("app.get('/api/market/overview'"), server.indexOf('// Candlestick Data Endpoint'));
  const candles = server.slice(server.indexOf("app.get('/api/market/candlesticks'"), server.indexOf('// Model metrics are unavailable'));
  assert.match(overview, /SYNTHETIC DEMO DATA · NOT EXNESS MARKET DATA/);
  assert.match(overview, /dataMode: 'SIMULATED_FEED'/);
  assert.match(overview, /Synthetic demo values — not an authenticated market feed/);
  assert.match(candles, /dataMode: 'SIMULATED_FEED'/);
  assert.match(dashboard, /SYNTHETIC DEMO DATA ONLY/);
  assert.match(dashboard, /NOT LIVE MARKET DATA/);
  assert.doesNotMatch(dashboard, /EXNESS DEMO FEED · READ-ONLY/);
});

test('unverified model performance, backtest, infrastructure, and dataset endpoints fail closed', () => {
  const modelRoute = server.slice(server.indexOf("app.get('/api/intelligence/models'"), server.indexOf('// Backtest remains unavailable'));
  const backtestRoute = server.slice(server.indexOf('// Backtest remains unavailable'), server.indexOf('// 4. Trading Infrastructure'));
  const infraRoute = server.slice(server.indexOf("app.get('/api/infrastructure/health'"), server.indexOf('// 5. Learning Universe'));
  const learningRoute = server.slice(server.indexOf("app.get('/api/learning/universe'"), server.indexOf('// Hybrid Architecture Endpoint'));

  for (const route of [modelRoute, backtestRoute, infraRoute, learningRoute]) {
    assert.match(route, /status\(503\)/);
    assert.match(route, /Cache-Control/);
  }
  assert.match(modelRoute, /MODEL_ARTIFACTS_NOT_VERIFIED/);
  assert.match(backtestRoute, /BACKTEST_ENGINE_NOT_CONFIGURED/);
  assert.match(infraRoute, /RUNTIME_HEALTH_EVIDENCE_UNAVAILABLE/);
  assert.match(infraRoute, /liveTradingEnabled: false/);
  assert.match(infraRoute, /ordersEnabled: false/);
  assert.match(infraRoute, /executionEnabled: false/);
  assert.match(learningRoute, /VERIFIED_DATASET_NOT_AVAILABLE/);
});

test('auto-training never increments fake epochs or fabricates samples and accuracy', () => {
  const training = server.slice(server.indexOf('// AUTO-TRAIN STATUS'), server.indexOf("app.get('/api/mt5-bridge/status'"));
  assert.match(training, /status\(503\)/);
  assert.match(training, /AUTO_TRAINING_NOT_CONFIGURED/);
  assert.match(training, /validationAccuracyPct: null/);
  assert.doesNotMatch(training, /setInterval|autoTrainEpoch\s*\+\+|autoTrainSamples\s*\+=|Math\.random/);
  assert.doesNotMatch(settings, /handleTriggerBackendTrain|setAutoTrainIntervalSec|Exness Direct Feed/);
  assert.match(settings, /BLOCKED · รอ Dataset\/Training Evidence/);
});

test('backtest UI states the real-data evidence gate before displaying performance', () => {
  assert.match(backtest, /Backtest ถูกปิดไว้ชั่วคราว/);
  assert.match(backtest, /spread, commission และ slippage/);
  assert.match(backtest, /VERIFIED BACKTEST UNAVAILABLE/);
});
