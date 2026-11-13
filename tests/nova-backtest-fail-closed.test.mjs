import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const start = server.indexOf("app.post('/api/backtest/run'");
const end = server.indexOf('// 4. Trading Infrastructure & Health', start);
const route = server.slice(start, end);

test('backtest endpoint fails closed until a verified engine is configured', () => {
  assert.notEqual(start, -1, 'backtest endpoint must remain explicitly registered');
  assert.notEqual(end, -1, 'backtest route boundary must remain present');
  assert.match(route, /status\(503\)/);
  assert.match(route, /BACKTEST_ENGINE_NOT_CONFIGURED/);
  assert.match(route, /results:\s*null/);
  assert.match(route, /liveTradingEnabled:\s*false/);
  assert.match(route, /ordersEnabled:\s*false/);
  assert.match(route, /executionEnabled:\s*false/);
});

test('backtest endpoint does not manufacture performance metrics or trade records', () => {
  assert.doesNotMatch(route, /profitFactor|winRatePct|netProfitPct|sharpeRatio|maxDrawdownPct/);
  assert.doesNotMatch(route, /totalTrades|winningTrades|losingTrades|equityCurve|recentTrades/);
  assert.doesNotMatch(route, /simulatedGain|generalizationScorePct|bt-tr-0/);
  assert.doesNotMatch(route, /res\.json\(\{\s*ok:\s*true/);
});
