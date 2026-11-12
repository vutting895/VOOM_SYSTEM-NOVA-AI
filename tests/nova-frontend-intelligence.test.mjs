import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');

const server = read('server.ts');
const dashboard = read('src/components/dashboard/TradingDashboardView.tsx');
const intelligence = read('src/components/intelligence/TradingIntelligenceView.tsx');
const backtest = read('src/components/backtest/BacktestSimulatorView.tsx');
const infrastructure = read('src/components/infrastructure/TradingInfrastructureView.tsx');
const learning = read('src/components/learning/LearningUniverseView.tsx');
const safetyBadge = read('src/components/common/ReadonlySafetyBadge.tsx');
const chart = read('src/components/dashboard/CandlestickChart.tsx');

test('server implements all 5 core platform endpoints with read-only safeguards', () => {
  assert.ok(server.includes("app.get('/api/market/overview'"));
  assert.ok(server.includes("app.get('/api/market/candlesticks'"));
  assert.ok(server.includes("app.get('/api/intelligence/models'"));
  assert.ok(server.includes("app.post('/api/backtest/run'"));
  assert.ok(server.includes("app.get('/api/infrastructure/health'"));
  assert.ok(server.includes("app.get('/api/learning/universe'"));

  // Infrastructure telemetry must fail closed until backed by verified runtime measurements.
  const infraStart = server.indexOf("app.get('/api/infrastructure/health'");
  const infraEnd = server.indexOf("app.get('/api/learning/universe'", infraStart);
  const infraRoute = server.slice(infraStart, infraEnd);
  assert.match(infraRoute, /status\(503\)/);
  assert.match(infraRoute, /INFRASTRUCTURE_TELEMETRY_NOT_CONFIGURED/);
  assert.match(infraRoute, /liveTradingEnabled: false/);
  assert.match(infraRoute, /mt5BridgeEnabled: false/);
});

test('Trading Dashboard view displays XAUUSDm, BTCUSD, Candlestick chart, Signals, and AI Analysis', () => {
  assert.ok(dashboard.includes('XAU/USDm'));
  assert.ok(dashboard.includes('BTC/USDm'));
  assert.ok(dashboard.includes('CandlestickChart'));
  assert.ok(dashboard.includes('AI Market Analysis'));
  assert.ok(dashboard.includes('AI Trading Signals'));
  assert.ok(dashboard.includes('ReadonlySafetyBadge'));
  assert.doesNotMatch(dashboard, /order_send|execute_live|place_trade_order/);
});

test('Trading Intelligence view covers all 6 AI models required by specification', () => {
  assert.ok(intelligence.includes('Elliott Wave 3'));
  assert.ok(intelligence.includes('XGBoost'));
  assert.ok(intelligence.includes('LSTM / PyTorch'));
  assert.ok(intelligence.includes('Smart Money Concepts'));
  assert.ok(intelligence.includes('Auto-Learning'));
  assert.ok(intelligence.includes('Neural Network Analysis'));
  assert.ok(intelligence.includes('ReadonlySafetyBadge'));
  assert.match(intelligence, /Ensemble Confidence/);
});

test('Backtest Simulator view provides historical testing, equity curve, and out-of-sample results', () => {
  assert.ok(backtest.includes('runSimulation'));
  assert.ok(backtest.includes('Equity Curve'));
  assert.ok(backtest.includes('Out-of-Sample Validation'));
  assert.ok(backtest.includes('In-Sample Training Split'));
  assert.ok(backtest.includes('Profit Factor'));
  assert.ok(backtest.includes('Win Rate'));
  assert.ok(backtest.includes('Max Drawdown'));
  assert.ok(backtest.includes('ReadonlySafetyBadge'));
  assert.match(backtest, /SIMULATED HISTORICAL BACKTEST/);
});

test('Trading Infrastructure view enforces MT5 connection, Exness Demo, and Risk Engine rules', () => {
  assert.ok(infrastructure.includes('MT5 Connection Status'));
  assert.ok(infrastructure.includes('Exness Demo Target'));
  assert.ok(infrastructure.includes('Broker Connector'));
  assert.ok(infrastructure.includes('Rule-Based Risk Engine'));
  assert.ok(infrastructure.includes('Data Pipeline'));
  assert.ok(infrastructure.includes('Model Training Status'));
  assert.ok(infrastructure.includes('ReadonlySafetyBadge'));
  assert.match(infrastructure, /HARD BLOCKED \(Fail-Closed\)/);
  assert.match(infrastructure, /ไม่รับและไม่แสดง Password\/Secrets/);
});

test('Learning Universe view features dataset management, model performance by regime, and update status', () => {
  assert.ok(learning.includes('Dataset Management & Feature Store'));
  assert.ok(learning.includes('Model Performance by Market Regime'));
  assert.ok(learning.includes('Continuous Training History'));
  assert.ok(learning.includes('Daily Data Update Status'));
  assert.ok(learning.includes('handleManualTrigger'));
  assert.ok(learning.includes('ReadonlySafetyBadge'));
});

test('Safety badge clearly presents READ-ONLY and LIVE TRADING OFF across all viewports', () => {
  assert.match(safetyBadge, /READ-ONLY MODE/);
  assert.match(safetyBadge, /LIVE TRADING: OFF/);
  assert.match(safetyBadge, /TARGET: EXNESS MT5 DEMO \(READ-ONLY\)/);
  assert.match(safetyBadge, /ไม่มีการจัดเก็บ Broker Password\/Secret/);
});
