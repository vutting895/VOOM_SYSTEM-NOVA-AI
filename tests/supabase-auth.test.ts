import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { createSupabaseAuthMiddleware } from '../server/supabase-auth';

async function requestWith(fetcher: typeof fetch, authorization?: string, env: Record<string,string|undefined> = { SUPABASE_URL: 'https://nova-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-key' }) {
  const app = express();
  app.get('/protected', createSupabaseAuthMiddleware(env, fetcher), (_req,res) => res.json({ userId: res.locals.novaUserId }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  try { return await fetch(`http://127.0.0.1:${address.port}/protected`, { headers: authorization ? { Authorization: authorization } : {} }); }
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
test('verified user identity is attached to request', async () => {
  const response = await requestWith(async (_input, init) => {
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return new Response(JSON.stringify({ id: 'user-A' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, 'Bearer valid');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: 'user-A' });
});
test('missing auth configuration returns 503', async () => {
  const response = await requestWith(async () => { throw new Error('must not call'); }, 'Bearer valid', {});
  assert.equal(response.status, 503);
});
