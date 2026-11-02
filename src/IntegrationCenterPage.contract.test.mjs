import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('./IntegrationCenterPage.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');
const hub = await readFile(new URL('../integrations/system-hub/worker.js', import.meta.url), 'utf8');

test('Integration Center is routed and uses the authenticated System Hub control plane', () => {
  assert.match(app, /path="\/integrations" element={<IntegrationCenterPage \/>}/);
  assert.match(page, /supabase\.auth\.getSession\(\)/);
  assert.match(page, /\/v1\/integrations/);
  assert.match(page, /\/v1\/connections/);
  assert.match(page, /Authorization: 'Bearer ' \+ session\.access_token/);
});
test('connection creation is explicitly approval-gated and only creates Exness Demo pending requests', () => {
  assert.match(page, /window\.confirm/);
  assert.match(page, /pending request/i);
  assert.match(hub, /status: "pending"/);
  assert.match(hub, /provider: "exness_mt5"/);
  assert.match(hub, /environment: "demo"/);
});
test('Integration Center exposes no credential fields or financial side-effect routes', () => {
  assert.doesNotMatch(page, /name=["'](?:api[_-]?secret|client[_-]?secret|broker[_-]?password)/i);
  assert.doesNotMatch(page, /\/orders?\b|\/withdrawals?\b|\/transfers?\b/i);
  assert.match(page, /ordersEnabled=false/);
  assert.match(page, /liveTradingEnabled=false/);
});
test('monitoring is bounded and local activity is not represented as a persistent audit log', () => {
  assert.match(page, /setInterval[\s\S]*30000/);
  assert.match(page, /ยังไม่ใช่ persistent audit log/i);
});
