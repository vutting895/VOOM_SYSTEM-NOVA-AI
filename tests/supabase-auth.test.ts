import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { createSupabaseAuthMiddleware, scopedThreadId } from '../server/supabase-auth';

const validEnv = {
  SUPABASE_URL: 'https://nova-test.supabase.co',
  NOVA_SUPABASE_ALLOWED_ORIGINS: 'https://nova-test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-key',
};

async function requestWith(fetcher: typeof fetch, authorization?: string, env: Record<string,string|undefined> = validEnv) {
  const app = express();
  app.get('/protected', createSupabaseAuthMiddleware(env, fetcher), (_req,res) => res.json({ userId: res.locals.novaUserId }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  try { return await fetch(\`http://127.0.0.1:\${address.port}/protected\`, { headers: authorization ? { Authorization: authorization } : {} }); }
  finally { await new Promise<void>((resolve,reject) => server.close(err => err ? reject(err) : resolve())); }
}

test('missing token returns 401 without calling Supabase', async () => {
  const response = await requestWith(async () => { throw new Error('must not call'); });
  assert.equal(response.status, 401);
});
test('invalid or expired token returns 401', async () => {
  const response = await requestWith(async () => new Response('{}', { status: 401 }), 'Bearer expired');
  assert.equal(response.status, 401);
});
test('Supabase outage fails closed with 503', async () => {
  const response = await requestWith(async () => { throw new Error('network down'); }, 'Bearer valid');
  assert.equal(response.status, 503);
});
test('verified user identity is attached to request and calls the exact allowlisted origin', async () => {
  const response = await requestWith(async (input, init) => {
    assert.equal(String(input), 'https://nova-test.supabase.co/auth/v1/user');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer valid');
    return new Response(JSON.stringify({ id: 'user-A' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, 'Bearer valid');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: 'user-A' });
});
test('unapproved HTTPS origin is rejected before forwarding the bearer token', async () => {
  let called = false;
  const env = { ...validEnv, SUPABASE_URL: 'https://attacker.example' };
  const response = await requestWith(async () => { called = true; throw new Error('must not call'); }, 'Bearer customer-token', env);
  assert.equal(response.status, 503);
  assert.equal(called, false);
});
test('URL credentials, paths, query, and fragments are rejected before fetch', async () => {
  for (const suffix of ['/nested', '?redirect=https://evil.example', '#fragment']) {
    let called = false;
    const env = { ...validEnv, SUPABASE_URL: 'https://nova-test.supabase.co' + suffix };
    const response = await requestWith(async () => { called = true; throw new Error('must not call'); }, 'Bearer customer-token', env);
    assert.equal(response.status, 503);
    assert.equal(called, false);
  }
  let called = false;
  const credentialUrl = 'https://user:pass@nova-test.supabase.co';
  const response = await requestWith(async () => { called = true; throw new Error('must not call'); }, 'Bearer customer-token', { ...validEnv, SUPABASE_URL: credentialUrl });
  assert.equal(response.status, 503);
  assert.equal(called, false);
});
test('malformed allowlist entries do not authorize an origin', async () => {
  let called = false;
  const response = await requestWith(async () => { called = true; throw new Error('must not call'); }, 'Bearer customer-token', {
    ...validEnv,
    NOVA_SUPABASE_ALLOWED_ORIGINS: 'https://nova-test.supabase.co/path',
  });
  assert.equal(response.status, 503);
  assert.equal(called, false);
});
test('missing auth configuration returns 503', async () => {
  const response = await requestWith(async () => { throw new Error('must not call'); }, 'Bearer valid', {});
  assert.equal(response.status, 503);
});
test('thread identifiers are isolated per authenticated user', () => {
  assert.notEqual(scopedThreadId('user-A', 'same-thread'), scopedThreadId('user-B', 'same-thread'));
});
