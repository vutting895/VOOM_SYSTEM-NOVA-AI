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
  assert.doesNotMatch(overview, /Exness MT5 Demo Terminal|dataMode: 'DEMO_READONLY'/);
  assert.match(overview, /dataClassification: 'SYNTHETIC_DEMO_SCENARIO'/);
  assert.equal((overview.match(/dataClassification: 'SYNTHETIC_DEMO_SCENARIO'/g) || []).length, 4);
  assert.doesNotMatch(overview, /dataClassification: 'DEMO_READONLY_SIGNAL'/);
});

test('unverified model performance, backtest, infrastructure, and dataset endpoints fail closed', () => {
  const modelRoute = server.slice(server.indexOf("app.get('/api/intelligence/models'"), server.indexOf('// Backtest remains unavailable'));
  const backtestRoute = server.slice(server.indexOf('// Backtest remains unavailable'), server.indexOf('// 4. Trading Infrastructure'));
  const infraRoute = server.slice(server.indexOf("app.get('/api/infrastructure/health'"), server.indexOf('// 5. Learning Universe'));
  const learningRoute = server.slice(server.indexOf("app.get('/api/learning/universe'"), server.indexOf('// Research-only chat.'));

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


test('chat, Gen-AI, and approvals never emit synthetic trade metrics or approval success', () => {
  const chatRoute = server.slice(server.indexOf("app.post('/api/chat'"), server.indexOf("app.post('/api/agent/approvals/decision'"));
  const approvalRoute = server.slice(server.indexOf("app.post('/api/agent/approvals/decision'"), server.indexOf("app.post('/api/gen-ai/generate'"));
  const genAiRoute = server.slice(server.indexOf("app.post('/api/gen-ai/generate'"), server.indexOf('// 5-LAYER ZERO-MENU'));
  assert.match(chatRoute, /status\(503\)/);
  assert.match(chatRoute, /MARKET_MODEL_EVIDENCE_NOT_VERIFIED/);
  assert.doesNotMatch(chatRoute, /tftConfidence|recommendedLots|stopLossPrice|takeProfitPrice|runSyntheticResearchScenario/);
  assert.match(approvalRoute, /status\(403\)/);
  assert.match(approvalRoute, /APPROVAL_MUTATIONS_DISABLED/);
  assert.doesNotMatch(approvalRoute, /APPROVED_SIMULATION_QUEUED|REJECTED_BY_USER/);
  assert.match(genAiRoute, /status\(503\)/);
  assert.match(genAiRoute, /GEN_AI_RESEARCH_RUNTIME_NOT_VERIFIED/);
  assert.doesNotMatch(genAiRoute, /recommendedLots|takeProfitPct|stopLossPct|runSyntheticResearchScenario/);
});

test('intent dispatcher blocks market/account reads and only serves static fixtures', () => {
  const route = server.slice(server.indexOf("app.post('/api/intent/dispatch'"), server.indexOf('// Approval resolution is research-only'));
  assert.match(route, /MARKET_OR_ACCOUNT_SOURCE_NOT_VERIFIED/);
  assert.match(route, /status: 'BLOCKED'/);
  assert.match(route, /STATIC_RESEARCH_FIXTURE_ONLY/);
  assert.match(route, /quantTelemetry: null/);
  assert.doesNotMatch(route, /runSyntheticResearchScenario|validateHardRiskRules|latencyMs: 1\.4|price: quant/);
});

test('settings never claim unpersisted configuration has been saved', () => {
  assert.match(settings, /ยังไม่ได้บันทึกลงระบบ/);
  assert.match(settings, /บันทึกไม่ได้ · ยังไม่มี Backend Persistence/);
  assert.doesNotMatch(settings, /เรียบร้อยแล้ว/);
  assert.doesNotMatch(settings, /handleTriggerBackendTrain|Exness Direct Feed|· เทรนซ้ำ/);
});

test('unverified broker catalogue, quantum runtime, and thread-state APIs fail closed', () => {
  const broker = server.slice(server.indexOf("app.get('/api/broker/instruments'"), server.indexOf('// Quantum inference is unavailable'));
  const quantum = server.slice(server.indexOf("app.post('/api/quantum/simulate'"), server.indexOf("app.get('/api/quantum/source'"));
  const source = server.slice(server.indexOf("app.get('/api/quantum/source'"), server.indexOf('// NOVA AI 5 CORE PLATFORM API ENDPOINTS'));
  const thread = server.slice(server.indexOf("app.get('/api/intent/thread/:threadId'"), server.indexOf("app.post('/api/intent/dispatch'"));
  const approval = server.slice(server.indexOf("app.post('/api/intent/interrupt/resolve'"), server.indexOf("app.get('/api/mcp/streamable'"));
  assert.match(broker, /status\(503\)/);
  assert.match(broker, /BROKER_INSTRUMENT_SOURCE_NOT_VERIFIED/);
  assert.match(quantum, /status\(503\)/);
  assert.match(quantum, /QUANTUM_MODEL_RUNTIME_NOT_VERIFIED/);
  assert.match(source, /status\(403\)/);
  assert.match(thread, /OWNER_SCOPED_THREAD_STORE_NOT_VERIFIED/);
  assert.match(approval, /OWNER_SCOPED_APPROVAL_STORE_NOT_VERIFIED/);
  assert.doesNotMatch(server, /ALL_MAJOR_PAIRS|meta\.price|LangGraphThreadState|validateHardRiskRules|runSyntheticResearchScenario/);
});

test('local clarification never recommends a BUY/SELL order or lot size', () => {
  const clarification = server.slice(server.indexOf('function checkAmbiguousOrInvalidParameters'), server.indexOf('// Strategy 1:'));
  assert.match(clarification, /TRADING_ACTIONS_DISABLED/);
  assert.match(clarification, /Architecture Checklist/);
  assert.match(clarification, /Component Catalog/);
  assert.doesNotMatch(clarification, /เปิด BUY|เปิด SELL|\d+\.\d+ Lot|FastMCP Schema Validation/);
});
