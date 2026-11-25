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
    assert.ok(candidate.includes('NovaAuditBlocked("' + name + '")'), name);
  }
  assert.equal((candidate.match(/\bOrderSend\s*\(/g) || []).length, 1);
  assert.equal((candidate.match(/NovaAuditOrderSend\s*\(/g) || []).length, 9);
  assert.equal((candidate.match(/\bgTrade\.PositionModify\s*\(/g) || []).length, 1);
  assert.match(candidate, /NOVA_REQUEST_AUDIT\|VERSION=1/);
  assert.match(candidate, /NOVA_REQUEST_AUDIT\|SUMMARY/);
});

test('Phase 2 candidate enforces NOVA daily Entry Lock Only and portfolio caps', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  assert.match(candidate, /InpDailyLossPct\s*=\s*10\.0/);
  assert.match(candidate, /InpMaxOpenRiskPct\s*=\s*9\.0/);
  assert.match(candidate, /InpMaxPositions\s*=\s*5/);
  assert.match(candidate, /InpV177_MaxTotalOpen\s*=\s*5/);
  assert.match(candidate, /gHeader\.daily_block=1;SaveState\(\);Print\(ENGINE_LABEL,": daily equity entry lock"\);/);
  assert.doesNotMatch(candidate, /gHeader\.daily_block=1;gHeader\.flatten_request=1;SaveState\(\);Print\(ENGINE_LABEL,": daily equity loss block"\);/);
  assert.match(candidate, /if\(gHeader\.flatten_request!=0\) CloseAllOwn\(\);/);
  assert.match(candidate, /if\(gHeader\.daily_block!=0\) return false; \/\/ Entry Lock Only: no new recovery exposure/);
  assert.match(candidate, /openRisk\+loss>eq\*InpMaxOpenRiskPct\/100\.0/);
});

test('portfolio limits include the separate Sniper magic and recovery entry path', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  const openRisk = candidate.slice(candidate.indexOf('double OpenRiskMoney('), candidate.indexOf('bool SelectLots('));
  assert.match(openRisk, /IsNOVAMagic\(magic\)/);
  assert.match(openRisk, /PositionGetString\(POSITION_SYMBOL\)/);
  assert.match(openRisk, /OrderGetString\(ORDER_SYMBOL\)/);
  assert.match(openRisk, /ORDER_PRICE_STOPLIMIT/);
  assert.match(openRisk, /OrderGetDouble\(ORDER_SL\)/);
  assert.match(candidate, /bool IsNOVAMagic\(const long magic\)/);
  assert.match(candidate, /V177_CountOpenTotal\(\).*?InpSniperMTF_Magic/s);
  assert.equal((candidate.match(/openPositions>=InpMaxPositions \|\| openRisk\+loss>eq\*InpMaxOpenRiskPct\/100\.0/g) || []).length, 2);
  assert.match(candidate, /req\.magic=\(ulong\)originalMagic/);
  assert.match(candidate, /if\(id<0\) \{ SendClose\(t\); continue; \}/);
});

test('Phase 2 portfolio risk and caps aggregate NOVA positions and pending orders across symbols', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  const risk = candidate.slice(candidate.indexOf('double OpenRiskMoney('), candidate.indexOf('bool SelectLots('));
  assert.match(risk, /IsNOVAMagic\(magic\)/);
  assert.match(risk, /OrderGetInteger\(ORDER_MAGIC\)/);
  assert.match(risk, /OrderGetDouble\(ORDER_VOLUME_CURRENT\)/);
  assert.match(risk, /if\(sl<=0 \|\| entry<=0 \|\| lots<=0\) return 1e99/);
  const counts = candidate.slice(candidate.indexOf('int V177_CountOpenTotal('), candidate.indexOf('int SniperMTF_CountOpen('));
  assert.match(counts, /PositionsTotal\(\)/);
  assert.match(counts, /OrdersTotal\(\)/);
  assert.doesNotMatch(counts, /POSITION_SYMBOL.*_Symbol/);
  assert.doesNotMatch(counts, /ORDER_SYMBOL.*_Symbol/);
});

test('Recovery first-hit thresholds use the lower money or equity-percent limit', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  assert.match(candidate, /triggerMoney\s*=\s*MathMin\(AutoMoney\(InpRecoveryTriggerMoney\),\s*eq\*InpRecoveryTriggerPct\/100\.0\)/);
  assert.match(candidate, /targetMoney\s*=\s*MathMin\(AutoMoney\(InpRecoveryTargetMoney\),\s*eq\*InpRecoveryTargetPct\/100\.0\)/);
  assert.match(candidate, /hardMoney\s*=\s*MathMin\(AutoMoney\(InpRecoveryMaxDDMoney\),\s*eq\*InpRecoveryMaxDDPct\/100\.0\)/);
  assert.match(candidate, /hardMoney2\s*=\s*MathMin\(AutoMoney\(InpRecoveryMaxDDMoney\),\s*eq\*InpRecoveryMaxDDPct\/100\.0\)/);
});

test('broker-day baseline is shared across symbols and fails closed when first attach is late', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  const baseline = candidate.slice(candidate.indexOf('bool LoadAccountDayBaseline('), candidate.indexOf('void DailyGuard('));
  assert.match(baseline, /FILE_COMMON/);
  assert.match(baseline, /ACCOUNT_LOGIN/);
  assert.match(baseline, /InpMagicBase/);
  assert.match(baseline, /ACCOUNT_SERVER/);
  assert.match(candidate, /#define NOVA_DAILY_BASELINE_GRACE_SECONDS 60/);
  assert.match(baseline, /trusted=\(TimeCurrent\(\)-day\)<=NOVA_DAILY_BASELINE_GRACE_SECONDS/);
  assert.match(candidate, /gHeader\.daily_block=baselineTrusted\?0:1/);
  assert.match(candidate, /no trusted broker-day opening baseline; entries locked until next broker day/);
});
