import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');

const fleet = read('src/components/QuickitMarketFleetView.tsx');
const intelligence = read('src/components/intelligence/TradingIntelligenceView.tsx');
const server = read('server.ts');

test('NOVA primary strategy defaults to SMC Mean Rejection in the active Vite frontend', () => {
  assert.match(fleet, /id: 'smc-mean-rejection'/);
  assert.match(fleet, /useState<string>\(STRATEGY_BLUEPRINTS\[0\]\.id\)/);
  assert.match(intelligence, /useState<string>\('smc-mean-rejection'\)/);
  assert.match(server, /id: 'smc-mean-rejection'[\s\S]*?status: 'RESEARCH_ONLY'/);
});

test('Wave3 is not presented as an active primary intelligence model', () => {
  assert.doesNotMatch(intelligence, /Elliott Wave 3/);
  assert.doesNotMatch(server, /id: 'elliott-wave-3'/);
});

test('SMC performance is not fabricated before validation evidence exists', () => {
  assert.match(server, /accuracyPct: null/);
  assert.match(server, /latencyMs: null/);
  assert.match(server, /ensembleConfidencePct: null/);
  assert.match(server, /performanceMetrics: null/);
  assert.match(intelligence, /NOT VALIDATED/);
});
