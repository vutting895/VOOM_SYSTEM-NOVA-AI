import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../frontend/app/command-center/page.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../frontend/app/command-center/command-center.css', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../frontend/components/nova-navigation.jsx', import.meta.url), 'utf8');
const frontendCi = await readFile(new URL('../.github/workflows/frontend-ci.yml', import.meta.url), 'utf8');
const cloudflareDeploy = await readFile(new URL('../.github/workflows/cloudflare-deploy.yml', import.meta.url), 'utf8');
const stagingIsolation = await readFile(new URL('./staging-customer-isolation.mjs', import.meta.url), 'utf8');
const chatRoute = await readFile(new URL('../frontend/app/api/chat/route.js', import.meta.url), 'utf8');

test('customer command center requires an authenticated Supabase session', () => {
  assert.match(page, /getSupabaseBrowserClient/);
  assert.match(page, /router\.replace\('\/login'\)/);
  assert.match(page, /auth\.state !== 'ready'/);
  assert.match(page, /Authorization: 'Bearer ' \+ (?:auth\.token|requestToken)/);
});

test('AI intent is reduced to the fixed strategy-draft schema', () => {
  assert.match(page, /intent\.schemaVersion !== 'nova\.intent\.v1'/);
  assert.match(page, /intent\.intent !== 'draft_strategy'/);
  assert.match(page, /component: \{ type: 'strategy_draft', executionEnabled: false, liveTradingEnabled: false \}/);
  assert.match(page, /WIDGET_ALLOWLIST = Object\.freeze\(\['smc_chart', 'risk_gauge', 'terminal_log', 'approval_card'\]\)/);
});

test('broker, chart and risk UI do not invent live account metrics', () => {
  assert.match(page, /Waiting for verified market candles/);
  assert.match(page, /ACCOUNT EQUITY" value="—"/);
  assert.match(page, /MARGIN USAGE" value="—"/);
  assert.match(page, /MAX DRAWDOWN" value="—"/);
  assert.match(page, /FastMCP\/Worker server logs/);
});

test('review actions use the owner-scoped durable approval API and stay non-executable', () => {
  assert.match(page, /\/api\/agent\/threads/);
  assert.match(page, /\/api\/agent\/approvals\//);
  assert.match(page, /APPROVALS_ENABLED/);
  assert.match(page, /EXECUTION DISABLED/);
  assert.match(page, /LIVE TRADING OFF/);
});

test('command center is menu-free and responsive on smaller screens', () => {
  assert.match(navigation, /pathname === '\/command-center'/);
  assert.match(styles, /@media\(max-width:900px\)/);
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /grid-template-columns:minmax\(300px,7fr\) minmax\(0,13fr\)/);
});

test('customer identity changes clear customer-scoped state and invalidate stale responses', () => {
  assert.match(page, /identityRef\.current !== userId/);
  assert.match(page, /resetCustomerState\(\)/);
  assert.match(page, /requestGenerationRef\.current/);
  assert.match(page, /generation !== requestGenerationRef\.current/);
});

test('chat API redacts credentials server-side before forwarding to the AI Worker', () => {
  assert.match(chatRoute, /redactSensitiveText/);
  assert.match(chatRoute, /const safeMessages = messages\.map/);
  assert.match(chatRoute, /messages: safeMessages/);
});


test('customer identity changes clear tenant state and invalidate stale async responses', () => {
  assert.match(page, /const resetCustomerState = useCallback/);
  assert.match(page, /requestGenerationRef\.current \+= 1/);
  assert.match(page, /setMessages\(\[makeWelcomeMessage\(\)\]\)/);
  assert.match(page, /setLogs\(\[\]\)/);
  assert.match(page, /setBroker\(\{ status: 'checking'/);
  assert.match(page, /const identityChanged = identityRef\.current !== userId/);
  assert.match(page, /if \(generation !== requestGenerationRef\.current\) return/);
  assert.match(page, /identityRef\.current !== expectedUserId/);
});


test('pull-request CI does not expose Cloudflare or Supabase deployment secrets to PR-controlled code', () => {
  assert.doesNotMatch(frontendCi, /cloudflare-pr-preview:/);
  assert.doesNotMatch(frontendCi, /staging-customer-isolation:/);
  assert.match(frontendCi, /Secret-bearing preview and staging acceptance jobs are intentionally excluded/);
  assert.doesNotMatch(frontendCi, /CLOUDFLARE_API_TOKEN:\\s*\\$\\{\\{\\s*secrets\\./);
  assert.doesNotMatch(frontendCi, /NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY:\\s*\\$\\{\\{\\s*secrets\\./);
});

test('stable Cloudflare frontend deployment remains owner opt-in', () => {
  assert.match(cloudflareDeploy, /vars\.DEPLOY_CLOUDFLARE_FRONTEND_MAIN == 'true'/);
});


test('staging sign-in forwards only an explicitly supplied CAPTCHA token', () => {
  assert.ok(stagingIsolation.includes('NOVA_STAGING_CAPTCHA_TOKEN'));
  assert.ok(stagingIsolation.includes('gotrue_meta_security: { captcha_token: captchaToken }'));
});

test('Cloudflare deploy pins Wrangler whenever any backend Worker or opted-in UI Worker is deployed', () => {
  assert.ok(cloudflareDeploy.includes("Install pinned Wrangler whenever a Worker will be deployed"));
  assert.ok(cloudflareDeploy.includes("steps.changed.outputs.mt5_relay == 'true'"));
  assert.ok(cloudflareDeploy.includes("steps.changed.outputs.mt5_proxy == 'true'"));
  assert.ok(cloudflareDeploy.includes("steps.changed.outputs.remote_mcp == 'true'"));
  assert.ok(cloudflareDeploy.includes("steps.changed.outputs.system_hub == 'true'"));
  assert.ok(cloudflareDeploy.includes("vars.DEPLOY_CLOUDFLARE_FRONTEND_MAIN == 'true'"));
  assert.ok(cloudflareDeploy.includes('wrangler@4.156.0'));
});
