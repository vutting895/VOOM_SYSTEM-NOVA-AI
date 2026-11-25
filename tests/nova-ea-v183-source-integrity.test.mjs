import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../integrations/mt5/ea-research/v1.83/source-variants/', import.meta.url);
const read = (name) => readFileSync(new URL(name, root));
const sha256 = (data) => createHash('sha256').update(data).digest('hex').toUpperCase();

const expected = {
  'Nova_EA_v1_83.mq5': '4D8838B6868CDB3509F01EC922D4F5787445896015E34BB3C1E61946B3EE0319',
  'Nova_EA_v1_83_SAFE_READONLY.mq5': '21285F68689C29EBA8C88E1FCA6C3307773CD467879E2AF591A4402BAB2A8125',
  'Nova_EA_v1_83_WORKING.mq5': '771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000',
  'Nova_EA_v1_83_REPAIRED.mq5': '771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000',
  'Nova_EA_v1_83_TEST_DAILY20_MAX10.mq5': '2462F7BD08109FBE8694ECC44F493DD42415EDDAB59104B78EFAE98D5AA2212F',
};

test('all archived v1.83 source variants match their captured SHA-256', () => {
  for (const [name, hash] of Object.entries(expected)) assert.equal(sha256(read(name)), hash, name);
});

test('WORKING and REPAIRED are byte-identical', () => {
  assert.deepEqual(read('Nova_EA_v1_83_WORKING.mq5'), read('Nova_EA_v1_83_REPAIRED.mq5'));
});

test('SAFE_READONLY declares immutable read-only mode and a permission gate', () => {
  const source = read('Nova_EA_v1_83_SAFE_READONLY.mq5').toString('utf8');
  assert.match(source, /const\s+bool\s+InpReadOnlyMode\s*=\s*true/);
  assert.match(source, /bool\s+TradePermission\s*\(/);
  assert.match(source, /if\s*\(\s*InpReadOnlyMode\s*\)\s*return\s+false\s*;/);
});

test('WORKING is unsafe research evidence, not a deployable default', () => {
  const source = read('Nova_EA_v1_83_WORKING.mq5').toString('utf8');
  assert.match(source, /InpTradeEnabled\s*=\s*true/);
  assert.match(source, /OrderSend\s*\(/);
});

test('Phase 2 candidate is compile-time disabled at every identified mutating path', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  assert.match(candidate, /^#define NOVA_PHASE2_EXECUTION_DISABLED true\b/m);
  const guarded = ['TradePermission', 'SendClose', 'ModifySL', 'Trail_SendPartialClose', 'RecoverySend', 'RecoveryPartialClose', 'ProcessCandidate', 'CancelOwnPending', 'SniperMTF_Check', 'MoveToBreakeven'];
  for (const name of guarded) {
    const re = new RegExp('(?:bool|void)\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{\\s*if\\s*\\(NOVA_PHASE2_EXECUTION_DISABLED\\)\\s*return');
    assert.match(candidate, re, name);
  }
  assert.equal((candidate.match(/OrderSend\s*\(/g) || []).length, 8);
  assert.equal((candidate.match(/\.PositionModify\s*\(/g) || []).length, 1);
});
