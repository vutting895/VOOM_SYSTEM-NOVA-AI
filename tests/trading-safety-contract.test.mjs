import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBrokerUnverifiedSnapshot, getCredentialIntakeDisabledResponse, getOrderExecutionBlockedResponse, getTradingSafetySnapshot, isLiveExecutionEnableRequest } from '../trading-safety.mjs';

test('trading status is Demo read-only with all execution flags disabled', () => {
  const s = getTradingSafetySnapshot('2026-11-04T00:00:00.000Z');
  assert.equal(s.liveTradingEnabled, false); assert.equal(s.tradingEnabled, false); assert.equal(s.ordersEnabled, false);
  assert.equal(s.executionEnabled, false); assert.equal(s.environment, 'demo'); assert.equal(s.mode, 'read-only'); assert.equal(s.mt5BridgeEnabled, false);
});

test('live-enable request detection is strict', () => {
  assert.equal(isLiveExecutionEnableRequest({ enabled: true }), true); assert.equal(isLiveExecutionEnableRequest({ enabled: false }), false);
  assert.equal(isLiveExecutionEnableRequest({}), false); assert.equal(isLiveExecutionEnableRequest(null), false);
});

test('order execution response is deny-only and cannot look like a fill', () => {
  const r = getOrderExecutionBlockedResponse(); assert.equal(r.ok, false); assert.equal(r.code, 'LIVE_EXECUTION_DISABLED');
  assert.equal(r.liveTradingEnabled, false); assert.equal(r.ordersEnabled, false); assert.equal(r.executionMode, 'read-only');
  assert.equal('ticket' in r, false); assert.equal('status' in r, false);
});

test('broker status never claims authenticated account connectivity', () => {
  const s = getBrokerUnverifiedSnapshot('exness', '2026-11-04T00:00:00.000Z');
  assert.equal(s.status, 'unverified'); assert.equal(s.connected, false); assert.equal(s.accountConnected, false);
  assert.equal(s.accountId, null); assert.deepEqual(s.capabilities, []); assert.equal(s.ordersEnabled, false);
});

test('legacy broker credential intake is disabled', () => {
  const r = getCredentialIntakeDisabledResponse(); assert.equal(r.ok, false);
  assert.equal(r.code, 'BROKER_CREDENTIAL_INTAKE_DISABLED'); assert.equal('apiKey' in r, false); assert.equal('apiSecret' in r, false);
});

test('server routes use fail-closed responses and contain no synthetic live fill', async () => {
  const s = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(s, /app\\.get\\('\\/api\\/live-trading\\/status'[\\s\\S]*?getTradingSafetySnapshot/);
  assert.match(s, /app\\.post\\('\\/api\\/live-trading\\/toggle'[\\s\\S]*?isLiveExecutionEnableRequest[\\s\\S]*?status\\(403\\)/);
  assert.match(s, /app\\.post\\('\\/api\\/orders\\/execute'[\\s\\S]*?status\\(403\\)[\\s\\S]*?getOrderExecutionBlockedResponse/);
  assert.match(s, /app\\.post\\('\\/api\\/broker\\/status'[\\s\\S]*?status\\(410\\)[\\s\\S]*?getCredentialIntakeDisabledResponse/);
  assert.doesNotMatch(s, /FILLED_LIVE|LIVE_REAL_EXECUTION|orders\\.create\\.live|orders\\.close\\.live|liveTradingEnabled\\s*=\\s*true/);
});

test('settings and terminal UI contain no static credentials or fake execution claims', async () => {
  const [settings, terminal] = await Promise.all([readFile(new URL('../src/components/SystemSettingsView.tsx', import.meta.url), 'utf8'), readFile(new URL('../src/components/LiveTradingTerminalView.tsx', import.meta.url), 'utf8')]);
  assert.doesNotMatch(settings, /EXN-ED25519|Exness-MT5Real14|exchangeApiKey|exchangeSecret|setLiveTradingEnabled/);
  assert.match(settings, /Live Trading OFF · Read-only/); assert.match(settings, /ยังไม่ยืนยัน session/);
  assert.doesNotMatch(terminal, /Exness Platform REST v1 \\(Ed25519\\) Stream Connected|Order Executed via Hybrid Quant Engine/);
  assert.match(terminal, /order submission is disabled in read-only mode/); assert.match(terminal, /Sample Price:/);
  assert.match(terminal, /ยังไม่มี position จาก broker session ที่ผ่านการยืนยัน/);
});
