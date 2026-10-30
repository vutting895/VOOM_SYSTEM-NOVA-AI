import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { redactSensitiveText } from '../frontend/lib/redact-sensitive-text.mjs';

const chatRoute = await readFile(new URL('../frontend/app/api/chat/route.js', import.meta.url), 'utf8');

test('redacts labeled API keys, passwords and access tokens', () => {
  const source = 'API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456 password="super-secret-value" access_token: abcdefghijklmnop';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /sk-proj-abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result, /super-secret-value/);
  assert.doesNotMatch(result, /abcdefghijklmnop/);
  assert.equal((result.match(/\[REDACTED\]/g) || []).length, 3);
});

test('redacts bearer credentials, JWTs, provider tokens and URL query secrets', () => {
  const source = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 Authorization: Basic dXNlcjpwYXNzd29yZA== eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature-value-1234567890 https://example.test/?token=token-value-123&ok=1 ghp_abcdefghijklmnopqrstuvwxyz1234567890 NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY=service-role-private-value';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /Bearer abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result, /Basic dXNlcjpwYXNzd29yZA==/);
  assert.doesNotMatch(result, /eyJhbGciOiJIUzI1NiJ9/);
  assert.doesNotMatch(result, /token-value-123/);
  assert.doesNotMatch(result, /ghp_abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.doesNotMatch(result, /service-role-private-value/);
});

test('redacts short Basic authorization credentials', () => {
  const result = redactSensitiveText('Authorization: Basic YTpi');
  assert.doesNotMatch(result, /YTpi/);
  assert.match(result, /\\[REDACTED\\]/);
});

test('redacts PEM private keys and preserves ordinary prose', () => {
  const source = 'Please review this setup.\nCookie: sessionid=private-cookie-value; auth=secret\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY----- Thank you.';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /private-material/);
  assert.doesNotMatch(result, /private-cookie-value/);
  assert.doesNotMatch(result, /auth=secret/);
  assert.match(result, /Please review this setup/);
  assert.match(result, /Thank you/);
});
test('non-string input is handled safely', () => {
  assert.equal(redactSensitiveText(null), '');
});


test('server redacts customer prompts before forwarding them to the AI Worker', () => {
  assert.match(chatRoute, /import \{ redactSensitiveText \}/);
  assert.match(chatRoute, /content: redactSensitiveText\(item\.content\)/);
  assert.match(chatRoute, /body: JSON\.stringify\(\{ messages: safeMessages \}\)/);
});
