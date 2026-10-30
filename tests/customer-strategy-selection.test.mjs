import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CUSTOMER_STRATEGIES,
  customerWorkspaceStorageKey,
  getCustomerStrategy,
  normalizeCustomerWorkspacePreferences,
} from '../frontend/lib/customer-strategies.mjs';

const selectionPage = await readFile(new URL('../frontend/app/strategies/page.jsx', import.meta.url), 'utf8');
const selectionStyles = await readFile(new URL('../frontend/app/strategies/strategy-selection.css', import.meta.url), 'utf8');
const commandCenter = await readFile(new URL('../frontend/app/command-center/page.jsx', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../frontend/components/nova-navigation.jsx', import.meta.url), 'utf8');

test('strategy catalog exposes only the three approved customer research strategies', () => {
  assert.deepEqual(CUSTOMER_STRATEGIES.map((strategy) => strategy.id), [
    'smc-precision',
    'wave3-confluence',
    'ai-market-scout',
  ]);
  assert.equal(getCustomerStrategy('wave3-confluence').name, 'Wave3 Confluence');
  assert.equal(getCustomerStrategy('untrusted-component').name, undefined);
  assert.equal(getCustomerStrategy('untrusted-component'), null);
});

test('customer preferences normalize to allowlisted market, risk and analysis values', () => {
  const normalized = normalizeCustomerWorkspacePreferences({
    strategyId: 'wave3-confluence',
    market: 'XAU/USD',
    riskProfile: 'medium',
    analysisStyle: 'technical',
    ignoredPrivilege: 'admin',
  });
  assert.deepEqual(normalized, {
    schemaVersion: 'nova.customer-workspace.v1',
    strategyId: 'wave3-confluence',
    market: 'XAU/USD',
    riskProfile: 'medium',
    analysisStyle: 'technical',
  });
  assert.equal(normalizeCustomerWorkspacePreferences({ strategyId: 'admin-strategy' }), null);
  assert.equal(normalizeCustomerWorkspacePreferences({
    strategyId: 'smc-precision',
    market: 'INJECTED_SYMBOL',
    riskProfile: 'root',
    analysisStyle: 'arbitrary-code',
  }).market, 'XAU/USD');
  assert.equal(normalizeCustomerWorkspacePreferences({
    strategyId: 'smc-precision',
    market: 'INJECTED_SYMBOL',
    riskProfile: 'root',
    analysisStyle: 'arbitrary-code',
  }).riskProfile, 'low');
});

test('workspace browser-storage keys are scoped to a valid Supabase Auth user UUID', () => {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.notEqual(customerWorkspaceStorageKey(userA), customerWorkspaceStorageKey(userB));
  assert.match(customerWorkspaceStorageKey(userA), new RegExp(userA));
  assert.equal(customerWorkspaceStorageKey('not-a-user-id'), null);
  assert.equal(customerWorkspaceStorageKey(''), null);
});

test('strategy selection requires Supabase Auth and persists only validated preferences', () => {
  assert.match(selectionPage, /getSupabaseBrowserClient/);
  assert.match(selectionPage, /router\.replace\('\/login'\)/);
  assert.match(selectionPage, /normalizeCustomerWorkspacePreferences\(draft\)/);
  assert.match(selectionPage, /customerWorkspaceStorageKey\(auth\.userId\)/);
  assert.match(selectionPage, /localStorage\.setItem\(storageKey, JSON\.stringify\(preferences\)\)/);
  assert.match(selectionPage, /Create my private dashboard/);
});

test('private dashboard loads customer strategy preferences and redirects new customers to selection', () => {
  assert.match(commandCenter, /customerWorkspaceStorageKey/);
  assert.match(commandCenter, /normalizeCustomerWorkspacePreferences/);
  assert.match(commandCenter, /router\.replace\('\/strategies'\)/);
  assert.match(commandCenter, /My <em>Private Dashboard<\/em>/);
  assert.match(commandCenter, /auth\.token/);
});

test('strategy selection and private dashboard keep their own premium responsive surfaces', () => {
  assert.match(selectionStyles, /@media\(max-width:1080px\)/);
  assert.match(selectionStyles, /@media\(max-width:760px\)/);
  assert.match(navigation, /pathname === '\/strategies'/);
});
