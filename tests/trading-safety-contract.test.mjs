import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBrokerUnverifiedSnapshot, getCredentialIntakeDisabledResponse, getOrderExecutionBlockedResponse, getTradingSafetySnapshot, isLiveExecutionEnableRequest } from '../trading-safety.mjs';

test('trading status is Demo read-only with all execution flags disabled', () => {
  const s = getTradingSafetySnapshot('2026-11-04T00:00:00.000Z');
  assert.equal(s.liveTradingEnabled, false);
  assert.equal(s.tradingEnabled, false);
  assert.equal(s.ordersEnabled, false);
  assert.equal(s.executionEnabled, false);
  assert.equal(s.environment, 'demo');
  assert.equal(s.mode, 'read-only');
  assert.equal(s.mt5BridgeEnabled, false);
});

test('live-enable request detection is strict', () => {
  assert.equal(isLiveExecutionEnableRequest({ enabled: true }), true);
  assert.equal(isLiveExecutionEnableRequest({ enabled: false }), false);
  assert.equal(isLiveExecutionEnableRequest({}), false);
  assert.equal(isLiveExecutionEnableRequest(null), false);
});

test('order execution response is deny-only and cannot look like a fill', () => {
  const r = getOrderExecutionBlockedResponse();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LIVE_EXECUTION_DISABLED');
  assert.equal(r.liveTradingEnabled, false);
  assert.equal(r.ordersEnabled, false);
  assert.equal(r.executionMode, 'read-only');
  assert.equal('ticket' in r, false);
  assert.equal('status' in r, false);
});

test('broker status never claims authenticated account connectivity', () => {
  const s = getBrokerUnverifiedSnapshot('exness', '2026-11-04T00:00:00.000Z');
  assert.equal(s.status, 'unverified');
  assert.equal(s.connected, false);
  assert.equal(s.accountConnected, false);
  assert.equal(s.accountId, null);
  assert.deepEqual(s.capabilities, []);
  assert.equal(s.ordersEnabled, false);
});

test('legacy broker credential intake is disabled', () => {
  const r = getCredentialIntakeDisabledResponse();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BROKER_CREDENTIAL_INTAKE_DISABLED');
  assert.equal('apiKey' in r, false);
  assert.equal('apiSecret' in r, false);
});

test('server routes use fail-closed responses and contain no synthetic live fill', async () => {
  const s = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  assert.ok(s.includes("app.get('/api/live-trading/status'"));
  assert.ok(s.includes("app.post('/api/live-trading/toggle'"));
  assert.ok(s.includes("app.post('/api/orders/execute'"));
  assert.ok(s.includes("app.post('/api/broker/status'"));
  assert.ok(s.includes('getOrderExecutionBlockedResponse()'));
  assert.ok(s.includes('getBrokerUnverifiedSnapshot(broker)'));
  assert.equal(s.includes('FILLED_LIVE'), false);
  assert.equal(s.includes('LIVE_REAL_EXECUTION'), false);
  assert.equal(s.includes('orders.create.live'), false);
  assert.equal(s.includes('orders.close.live'), false);
  assert.equal(s.includes('liveTradingEnabled = true'), false);
});

test('settings and terminal UI contain no static credentials or fake execution claims', async () => {
  const [settings, terminal] = await Promise.all([
    readFile(new URL('../src/components/SystemSettingsView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LiveTradingTerminalView.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal(settings.includes('EXN-ED25519'), false);
  assert.equal(settings.includes('Exness-MT5Real14'), false);
  assert.equal(settings.includes('exchangeApiKey'), false);
  assert.equal(settings.includes('exchangeSecret'), false);
  assert.equal(settings.includes('setLiveTradingEnabled'), false);
  assert.ok(settings.includes('Live Trading OFF · Read-only'));
  assert.ok(settings.includes('ยังไม่ยืนยัน session'));
  assert.equal(terminal.includes('Exness Platform REST v1 (Ed25519) Stream Connected'), false);
  assert.equal(terminal.includes('Order Executed via Hybrid Quant Engine'), false);
  assert.ok(terminal.includes('order submission is disabled in read-only mode'));
  assert.ok(terminal.includes('Sample Price:'));
  assert.ok(terminal.includes('ยังไม่มี position จาก broker session ที่ผ่านการยืนยัน'));
});
