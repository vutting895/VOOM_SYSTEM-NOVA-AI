import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText } from '../frontend/lib/redact-sensitive-text.mjs';

test('redacts labeled API keys, passwords and access tokens', () => {
  const source = 'API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456 password="super-secret-value" access_token: abcdefghijklmnop';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /sk-proj-abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result, /super-secret-value/);
  assert.doesNotMatch(result, /abcdefghijklmnop/);
  assert.equal((result.match(/\[REDACTED\]/g) || []).length, 3);
});

test('redacts bearer credentials, JWTs, provider tokens and URL query secrets', () => {
  const source = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 https://example.test/?token=token-value-123&ok=1 ghp_abcdefghijklmnopqrstuvwxyz1234567890';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /Bearer abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result, /token-value-123/);
  assert.doesNotMatch(result, /ghp_abcdefghijklmnopqrstuvwxyz1234567890/);
});

test('redacts PEM private keys and preserves ordinary prose', () => {
  const source = 'Please review this setup. -----BEGIN PRIVATE KEY-----\\nprivate-material\\n-----END PRIVATE KEY----- Thank you.';
  const result = redactSensitiveText(source);
  assert.doesNotMatch(result, /private-material/);
  assert.match(result, /Please review this setup/);
  assert.match(result, /Thank you/);
});

test('non-string input is handled safely', () => {
  assert.equal(redactSensitiveText(null), '');
});
