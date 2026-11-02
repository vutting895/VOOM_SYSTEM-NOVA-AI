import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('./IntegrationCenterPage.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');
const hub = await readFile(new URL('../integrations/system-hub/worker.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const netlify = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');

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

test('rejected Hub sessions clear private state and permit a fresh sign-in', () => {
  assert.match(page, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(page, /setSessionReady\(false\)/);
  assert.match(page, /setSnapshot\(\{ integrations: \[\], connections: \[\], health \}\)/);
});
test('read-only verification is displayed only from a matching successful Hub response', () => {
  assert.match(page, /result\.connectionId !== connection\.connectionId/);
  assert.match(page, /result\.dataVerified !== true/);
  assert.match(page, /verificationByConnection\[exnessConnection\.connectionId\]/);
});
test('trading safety is locked only when orders, execution, and live trading are all explicitly false', () => {
  assert.match(page, /ordersEnabled === false && snapshot\.health\?\.executionEnabled === false && snapshot\.health\?\.liveTradingEnabled === false/);
});

test('production hosting preserves the Integration Center route and Supabase callback', () => {
  assert.match(server, /app\.get\('\*'/);
  assert.match(netlify, /base = "\."/);
  assert.match(netlify, /command = "npm install --no-package-lock && npm run build"/);
  assert.match(netlify, /publish = "dist"/);
  assert.match(redirects, /\/\* \/index\.html 200/);
});

test('Hub is not labeled healthy unless authentication is configured', () => {
  assert.match(page, /snapshot\.health\?\.status === 'ready' && snapshot\.health\?\.authConfigured === true/);
});

test('Vite can reuse the existing public Netlify configuration without changing account settings', () => {
  assert.match(viteConfig, /envPrefix: \['VITE_', 'NEXT_PUBLIC_'\]/);
  assert.match(page, /VITE_SUPABASE_URL \|\| runtimeEnv\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(page, /VITE_SUPABASE_ANON_KEY \|\| runtimeEnv\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(page, /VITE_SYSTEM_HUB_URL \|\| runtimeEnv\.NEXT_PUBLIC_SYSTEM_HUB_URL/);
});

test('owner changes and sign-out clear previous tenant connection and verification state', () => {
  assert.match(page, /sessionUserIdRef\.current && sessionUserIdRef\.current !== nextUserId/);
  assert.match(page, /sessionUserIdRef\.current = ''/);
  assert.match(page, /setVerificationByConnection\(\{\}\)/);
  assert.match(page, /setSnapshot\(\{ integrations: \[\], connections: \[\], health \}\)/);
});

test('planned providers are visible but explicitly non-connectable until adapters pass gates', () => {
  for (const id of ['github', 'google-ai-studio', 'cloudflare', 'netlify', 'flyio-sprites']) assert.ok(page.includes("id: '" + id + "'"));
  assert.match(page, /PLANNED · DISABLED/);
  assert.match(page, /ยังไม่มีปุ่มเชื่อมต่อ/);
});
