import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchWithBearer } from '../src/lib/authenticated-fetch.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('frontend routes require a Supabase session before displaying NOVA workspaces', async () => {
  const app = await read('../src/App.tsx');
  const main = await read('../src/main.tsx');
  assert.match(app, /useAuth\(\)/);
  assert.match(app, /Navigate to="\/login"/);
  assert.match(app, /if \(!session\)/);
  assert.match(app, /location\.pathname === '\/login'/);
  assert.doesNotMatch(app, /<Route path="\/login"/);
  assert.match(main, /<AuthProvider>/);
});

test('Supabase Auth restores sessions and supports password sign-in and local sign-out', async () => {
  const provider = await read('../src/auth/AuthProvider.tsx');
  assert.match(provider, /onAuthStateChange/);
  assert.match(provider, /getSession\(\)/);
  assert.match(provider, /signInWithPassword/);
  assert.match(provider, /signOut\(\{ scope: 'local' \}\)/);
});

test('browser configuration exposes only public Supabase URL and publishable key', async () => {
  const vite = await read('../vite.config.ts');
  const envExample = await read('../.env.example');
  const client = await read('../src/lib/supabase.ts');
  assert.match(vite, /VITE_SUPABASE_URL/);
  assert.match(vite, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(vite, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(vite, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(vite, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_KEY/i);
  assert.match(envExample, /^VITE_SUPABASE_URL=$/m);
  assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=$/m);
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE|EXNESS_PASSWORD|BINANCE_API_SECRET/);
  assert.match(client, /createClient/);
  assert.match(client, /persistSession: true/);
});

test('authenticated fetch fails before network when there is no access token', async () => {
  let called = false;
  await assert.rejects(
    fetchWithBearer('https://worker.example/api/chat', async () => null, {}, async () => {
      called = true;
      return new Response('{}');
    }),
    /authentication_required/,
  );
  assert.equal(called, false);
});

test('authenticated fetch overwrites caller Authorization and disables redirects and cache', async () => {
  let seen;
  await fetchWithBearer(
    'https://worker.example/api/chat',
    async () => 'current-session-token',
    { method: 'POST', headers: { Authorization: 'Bearer attacker-token' } },
    async (url, init) => {
      seen = { url, init };
      return new Response('{}', { status: 200 });
    },
  );
  assert.equal(seen.init.headers.get('Authorization'), 'Bearer current-session-token');
  assert.equal(seen.init.cache, 'no-store');
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.redirect, 'error');
});

test('API clients use fixed HTTPS Worker origins and validate route paths', async () => {
  const api = await read('../src/lib/api.ts');
  assert.match(api, /https:\/\/voom-system-hub\.suwapat787\.workers\.dev/);
  assert.match(api, /https:\/\/voom-system-nova-ai\.suwapat787\.workers\.dev/);
  assert.match(api, /path\.startsWith\('\/'\)/);
  assert.match(api, /target\.origin !== baseUrl/);
  assert.match(api, /fetchWithBearer/);
});

test('Vite build configuration preserves the root SPA settings', async () => {
  const vite = await read('../vite.config.ts');
  assert.match(vite, /@vitejs\/plugin-react/);
  assert.match(vite, /@tailwindcss\/vite/);
  assert.match(vite, /hmr: false/);
  assert.match(vite, /loadEnv/);
});
