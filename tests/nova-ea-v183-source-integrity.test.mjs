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
  const adapter = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/include/NOVA_BrokerAdapter.mqh', import.meta.url), 'utf8');
  assert.equal((candidate.match(/(?<!NOVA_Broker)OrderSend\s*\(/g) || []).length, 0);
  assert.equal((candidate.match(/NOVA_BrokerOrderSend\s*\(/g) || []).length, 8);
  assert.equal((candidate.match(/NOVA_BrokerPositionModify\s*\(/g) || []).length, 1);
  assert.equal((adapter.match(/\bOrderSend\s*\(/g) || []).length, 1);
  assert.equal((adapter.match(/trade\.PositionModify\s*\(/g) || []).length, 1);
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
  assert.match(openRisk, /NOVA_IsManagedMagic\(magic\)/);
  assert.match(candidate, /V177_CountOpenTotal\(\).*?InpSniperMTF_Magic/s);
  assert.equal((candidate.match(/openPositions>=InpMaxPositions \|\| openRisk\+loss>eq\*InpMaxOpenRiskPct\/100\.0/g) || []).length, 2);
  assert.match(candidate, /req\.magic=\(ulong\)originalMagic/);
  assert.match(candidate, /if\(id<0\) \{ SendClose\(t\); continue; \}/);
});


test('research SMC mode is opt-in, closed-bar based, and requires a confirmed sequence', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  assert.match(candidate, /InpResearchSMC_Mode\s*=\s*false/);
  assert.match(candidate, /CopyRates\(_Symbol,PERIOD_H1,1,160,h1\)/);
  assert.match(candidate, /bool ResearchSMC_PriorSwingLevel\(const int dir,double &level\)/);
  assert.match(candidate, /for\(int shift=5;shift<=last;shift\+\+\)/);
  assert.match(candidate, /gRates\[shift\+k\]\.low/);
  assert.match(candidate, /iTime\(_Symbol,PERIOD_H1,1\)/);
  assert.match(candidate, /if\(aiScore<3 \|\| !ResearchSMC_H1Trend\(dir\)\) return/);
  assert.match(candidate, /InpResearchSMC_MinStopATR\*atr/);
  assert.match(candidate, /3\.0\*\(double\)spread\*_Point/);
  assert.match(candidate, /tpDist=slDist\*InpResearchSMC_RewardRisk/);
  assert.match(candidate, /InpResearchSMC_Mode\?1\.0:AISniper_LotBoost\(aiScore\)/);
  assert.match(candidate, /if\(InpResearchSMC_Mode\) return; \/\/ never round risk upward to broker minimum volume/);
});

test('portfolio risk and count include managed positions and pending orders across symbols', () => {
  const candidate = readFileSync(new URL('../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5', import.meta.url), 'utf8');
  const openRisk = candidate.slice(candidate.indexOf('double OpenRiskMoney('), candidate.indexOf('bool SelectLots('));
  assert.match(openRisk, /OrderGetTicket\(i\)/);
  assert.match(openRisk, /ORDER_VOLUME_CURRENT/);
  assert.match(openRisk, /OrderCalcProfit\(isBuy\?ORDER_TYPE_BUY:ORDER_TYPE_SELL,symbol,lots,entry,sl,p\)/);
  assert.match(openRisk, /if\(sl<=0 \|\| lots<=0\) return 1e99/);
  assert.doesNotMatch(openRisk, /POSITION_SYMBOL\)!=_Symbol/);
  const counts = candidate.slice(candidate.indexOf('bool V177_MatchesExposure('), candidate.indexOf('bool V177_CanOpenCore('));
  assert.match(counts, /OrdersTotal\(\)/);
  assert.match(counts, /V177_CountOpenTotal\(\) \{ return V177_CountExposure\(0\); \}/);
  assert.match(candidate, /NOVA_PortfolioReserve\(/);
  assert.match(candidate, /NOVA_PortfolioReconcile\(\)/);
  assert.doesNotMatch(openRisk, /gState\[i\]\.inflight_risk_money/);
});
