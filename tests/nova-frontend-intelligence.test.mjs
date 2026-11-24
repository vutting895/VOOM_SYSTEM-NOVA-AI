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

test('NOVA retains UI and health endpoints while legacy Learning and Backtest routes are retired', () => {
  assert.ok(server.includes("app.get('/api/market/overview'"));
  assert.ok(server.includes("app.get('/api/market/candlesticks'"));
  assert.ok(server.includes("app.get('/api/infrastructure/health'"));
  for (const route of [
    "app.get('/api/intelligence/models'",
    "app.post('/api/backtest/run'",
    "app.get('/api/learning/universe'",
    "app.get('/api/auto-train/status'",
    "app.post('/api/auto-train/trigger'",
  ]) assert.ok(server.includes(route));
  assert.match(server, /legacy_route_removed/);
  assert.match(server, /NOVA Remote MCP -> model_list/);
  assert.match(server, /NOVA Remote MCP -> backtest_run/);

  assert.match(server, /systemMode:\s*'FAIL_CLOSED_READONLY'/);
  assert.match(server, /orderExecutionBlocked:\s*true/);
  assert.match(server, /realMoneyWritesDisabled:\s*true/);
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

test('Trading Intelligence view reports only persisted Datacenter model registry records', () => {
  assert.ok(intelligence.includes('datacenterResearchService.listModels()'));
  assert.ok(intelligence.includes('Datacenter Model Registry'));
  assert.ok(intelligence.includes('deployment_eligible'));
  assert.ok(intelligence.includes('ReadonlySafetyBadge'));
  assert.doesNotMatch(intelligence, /Ensemble Confidence|87\.5|84\.6|79\.2|76\.8/);
});

test('Backtest UI uses approved Datacenter datasets and persisted research history', () => {
  assert.ok(backtest.includes('datacenterResearchService.listApprovedDatasets()'));
  assert.ok(backtest.includes('datacenterResearchService.runBacktest'));
  assert.ok(backtest.includes('datacenterResearchService.runWalkForward'));
  assert.ok(backtest.includes('research_run_list'));
  assert.ok(backtest.includes('commission_bps'));
  assert.ok(backtest.includes('slippage_bps'));
  assert.ok(backtest.includes('ReadonlySafetyBadge'));
  assert.doesNotMatch(backtest, /\/api\/backtest\/run|In-Sample Training Split|generalizationScorePct/);
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

test('Learning dashboard reads Datacenter registries and submits pinned training jobs', () => {
  assert.ok(learning.includes('datacenterResearchService.listDatasets()'));
  assert.ok(learning.includes('datacenterResearchService.listUniverses()'));
  assert.ok(learning.includes('datacenterResearchService.listModels()'));
  assert.ok(learning.includes('datacenterResearchService.submitTraining'));
  assert.ok(learning.includes('approved Dataset version'));
  assert.ok(learning.includes('ReadonlySafetyBadge'));
  assert.doesNotMatch(learning, /accuracyPct: 83\.2|totalSamplesStored: 1485000|Cron Daemon/);
});

test('Safety badge clearly presents READ-ONLY and LIVE TRADING OFF across all viewports', () => {
  assert.match(safetyBadge, /READ-ONLY MODE/);
  assert.match(safetyBadge, /LIVE TRADING: OFF/);
  assert.match(safetyBadge, /TARGET: EXNESS MT5 DEMO \(READ-ONLY\)/);
  assert.match(safetyBadge, /ไม่มีการจัดเก็บ Broker Password\/Secret/);
});
