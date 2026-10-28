import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/app.js';

const app = createApp();

test('health endpoint always reports paper-only and no order execution', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.tradingMode, 'paper');
  assert.equal(response.body.liveTradingEnabled, false);
  assert.equal(response.body.orderExecution, 'disabled');
});

test('telemetry endpoint rejects requests without configured secret', async () => {
  const old = process.env.VOOM_BRIDGE_SHARED_SECRET;
  delete process.env.VOOM_BRIDGE_SHARED_SECRET;
  try {
    await request(app).post('/api/mt5/telemetry').send({}).expect(503);
  } finally {
    if (old === undefined) delete process.env.VOOM_BRIDGE_SHARED_SECRET;
    else process.env.VOOM_BRIDGE_SHARED_SECRET = old;
  }
});

test('telemetry endpoint rejects wrong secret', async () => {
  process.env.VOOM_BRIDGE_SHARED_SECRET = 'a'.repeat(40);
  await request(app)
    .post('/api/mt5/telemetry')
    .set('X-Voom-Bridge-Secret', 'wrong')
    .send({})
    .expect(401);
});

test('telemetry endpoint validates schema and accepts paper telemetry only', async () => {
  process.env.VOOM_BRIDGE_SHARED_SECRET = 'b'.repeat(40);
  const now = new Date().toISOString();
  const accepted = await request(app)
    .post('/api/mt5/telemetry')
    .set('X-Voom-Bridge-Secret', 'b'.repeat(40))
    .send({
      source: 'mt5-ea',
      mode: 'paper',
      timestamp: now,
      terminalConnected: true,
      accountConnected: true,
      symbol: 'EURUSD',
      timeframe: 'M15',
      bid: 1.1,
      ask: 1.1002,
      balance: 12345,
      equity: 12222
    })
    .expect(202);
  assert.equal(accepted.body.liveTradingEnabled, false);
  assert.equal(accepted.body.orderExecution, 'disabled');

  const status = await request(app).get('/api/mt5/status').expect(200);
  assert.equal(status.body.telemetry.symbol, 'EURUSD');
  assert.equal('balance' in status.body.telemetry, false);
  assert.equal('equity' in status.body.telemetry, false);

  const dashboard = await request(app).get('/api/dashboard/status').expect(200);
  assert.equal(dashboard.body.connected, true);
  assert.equal(dashboard.body.tradingMode, 'paper');
  assert.equal(dashboard.body.liveTradingEnabled, false);
  assert.equal(dashboard.body.orderExecution, 'disabled');
  assert.equal(dashboard.body.telemetry.symbol, 'EURUSD');
  assert.equal(dashboard.body.telemetry.timeframe, 'M15');
  assert.equal('balance' in dashboard.body.telemetry, false);
  assert.equal('equity' in dashboard.body.telemetry, false);
  assert.equal('bid' in dashboard.body.telemetry, false);
  assert.equal('ask' in dashboard.body.telemetry, false);
  assert.equal('VOOM_BRIDGE_SHARED_SECRET' in dashboard.body, false);
});
