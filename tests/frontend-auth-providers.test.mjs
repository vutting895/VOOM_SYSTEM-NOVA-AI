import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panel = await readFile(new URL('../frontend/components/auth-panel.jsx', import.meta.url), 'utf8');
const login = await readFile(new URL('../frontend/app/login/page.jsx', import.meta.url), 'utf8');
const register = await readFile(new URL('../frontend/app/register/page.jsx', import.meta.url), 'utf8');

test('NOVA exposes Google and Facebook OAuth through Supabase Auth', () => {
  assert.match(panel, /signInWithOAuth\(\{\s*provider,/);
  assert.match(panel, /signInWithProvider\('google'\)/);
  assert.match(panel, /signInWithProvider\('facebook'\)/);
  assert.match(panel, /\/auth\/callback/);
});

test('email login and registration use separate account-creation policy', () => {
  assert.match(panel, /shouldCreateUser:\s*isRegister/);
  assert.match(panel, /captchaToken/);
  assert.match(login, /mode="login"/);
  assert.match(register, /mode="register"/);
});

test('registration requires explicit consent and all auth routes reuse one panel', () => {
  assert.match(panel, /if \(isRegister && !accepted\)/);
  assert.match(panel, /nova-auth-consent/);
  assert.match(login, /AuthPanel/);
  assert.match(register, /AuthPanel/);
});

test('browser auth code does not contain OAuth or Turnstile secret material', () => {
  assert.doesNotMatch(panel, /client_secret|app_secret|turnstile_secret|service_role/i);
});
