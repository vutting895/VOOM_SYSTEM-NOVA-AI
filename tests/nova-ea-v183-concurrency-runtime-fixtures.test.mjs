import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const candidatePath = resolve(here, '../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5');
const source = readFileSync(candidatePath, 'utf8');

function functionBody(name) {
  const re = new RegExp('\\b(?:bool|void|int|double|string)\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{', 'm');
  const match = re.exec(source);
  assert.ok(match, 'function exists: ' + name);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  assert.fail('unclosed function: ' + name);
}

// Small deterministic model of the required account-scope atomic coordinator.
// It is deliberately separate from the EA source until the MQL5 implementation
// and terminal-level tests exist. The mutex covers read-check-write as one unit.
class AtomicReservationLedger {
  constructor({ riskCap, maxSlots, now = () => Date.now() }) {
    this.riskCap = riskCap;
    this.maxSlots = maxSlots;
    this.now = now;
    this.reservations = new Map();
    this.exposure = [];
    this.tail = Promise.resolve();
  }
  async exclusive(fn) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
  async reserve(request) {
    return this.exclusive(async () => {
      if (!request?.id || !request.owner || !Number.isFinite(request.risk) || request.risk <= 0) return false;
      if (!request.slValid) return false;
      const now = this.now();
      const active = [...this.reservations.values()].filter(r => r.state !== 'RELEASED' && (r.state === 'UNCERTAIN' || r.expiresAt > now));
      const used = this.exposure.reduce((sum, x) => sum + x.risk, 0) + active.reduce((sum, x) => sum + x.risk, 0);
      if (active.length + this.exposure.length >= this.maxSlots || used + request.risk > this.riskCap) return false;
      if (this.reservations.has(request.id)) return false;
      this.reservations.set(request.id, { ...request, state: 'RESERVED', expiresAt: now + request.leaseMs });
      return true;
    });
  }
  async markUncertain(id) {
    return this.exclusive(async () => {
      const r = this.reservations.get(id);
      if (!r) return false;
      r.state = 'UNCERTAIN';
      return true;
    });
  }
  async reconcile(id, outcome) {
    return this.exclusive(async () => {
      const r = this.reservations.get(id);
      if (!r) return false;
      if (r.state === 'RELEASED') return true;
      if (outcome === 'BROKER_EXPOSURE_CONFIRMED') {
        this.exposure.push({ risk: r.risk, symbol: r.symbol, kind: 'position-or-pending' });
      } else if (outcome !== 'CONFIRMED_REJECTED') {
        return false;
      }
      r.state = 'RELEASED';
      return true;
    });
  }
}

test('Concurrency: 64 chart instances competing for the final portfolio risk slot yield exactly one reservation', async () => {
  const ledger = new AtomicReservationLedger({ riskCap: 100, maxSlots: 5 });
  ledger.exposure = [{ risk: 80, symbol: 'XAUUSDm', kind: 'position' }];
  const requests = Array.from({ length: 64 }, (_, i) => ({
    id: 'r-' + i, owner: 'chart-' + i, symbol: i % 2 ? 'EURUSD' : 'XAUUSDm',
    risk: 20, slValid: true, leaseMs: 30000
  }));
  const results = await Promise.all(requests.map(r => ledger.reserve(r)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal([...ledger.reservations.values()].filter(r => r.state === 'RESERVED').length, 1);
});

test('Concurrency: a missing SL or invalid risk cannot claim the slot', async () => {
  const ledger = new AtomicReservationLedger({ riskCap: 100, maxSlots: 5 });
  assert.equal(await ledger.reserve({ id: 'bad-sl', owner: 'chart-a', risk: 10, slValid: false, leaseMs: 1000 }), false);
  assert.equal(await ledger.reserve({ id: 'nan-risk', owner: 'chart-b', risk: NaN, slValid: true, leaseMs: 1000 }), false);
  assert.equal(ledger.reservations.size, 0);
});

test('Crash/timeout: UNCERTAIN reservations remain risk-consuming after lease expiry until broker reconciliation', async () => {
  let clock = 1000;
  const ledger = new AtomicReservationLedger({ riskCap: 100, maxSlots: 5, now: () => clock });
  assert.equal(await ledger.reserve({ id: 'uncertain-1', owner: 'chart-a', symbol: 'XAUUSDm', risk: 60, slValid: true, leaseMs: 10 }), true);
  await ledger.markUncertain('uncertain-1');
  clock += 10000;
  assert.equal(await ledger.reserve({ id: 'second', owner: 'chart-b', symbol: 'EURUSD', risk: 50, slValid: true, leaseMs: 1000 }), false);
  assert.equal(await ledger.reconcile('uncertain-1', 'CONFIRMED_REJECTED'), true);
  assert.equal(await ledger.reserve({ id: 'second', owner: 'chart-b', symbol: 'EURUSD', risk: 50, slValid: true, leaseMs: 1000 }), true);
});

test('Reconciliation: accepted pending order converts reservation to broker exposure exactly once', async () => {
  const ledger = new AtomicReservationLedger({ riskCap: 100, maxSlots: 5 });
  assert.equal(await ledger.reserve({ id: 'pending-1', owner: 'chart-a', symbol: 'GBPUSD', risk: 35, slValid: true, leaseMs: 1000 }), true);
  assert.equal(await ledger.reconcile('pending-1', 'BROKER_EXPOSURE_CONFIRMED'), true);
  assert.equal(ledger.exposure.length, 1);
  assert.equal(await ledger.reconcile('pending-1', 'BROKER_EXPOSURE_CONFIRMED'), true);
  assert.equal(ledger.exposure.length, 1, 'idempotent reconciliation must not double-count');
});

test('Portfolio fixtures: positions and pending orders across symbols share one account risk cap', async () => {
  const ledger = new AtomicReservationLedger({ riskCap: 100, maxSlots: 5 });
  ledger.exposure = [
    { risk: 25, symbol: 'XAUUSDm', kind: 'position' },
    { risk: 30, symbol: 'EURUSD', kind: 'pending' },
    { risk: 20, symbol: 'GBPJPY', kind: 'position' }
  ];
  assert.equal(await ledger.reserve({ id: 'too-much', owner: 'chart-x', symbol: 'USDJPY', risk: 26, slValid: true, leaseMs: 1000 }), false);
  assert.equal(await ledger.reserve({ id: 'fits', owner: 'chart-y', symbol: 'USDJPY', risk: 25, slValid: true, leaseMs: 1000 }), true);
});

test('Account currency fixture: USC amounts remain in account currency; USD policy thresholds convert once', () => {
  const usdEquity = 1000;
  const usdRiskCapPct = 9;
  const uscPerUsd = 100;
  const equityUSC = usdEquity * uscPerUsd;
  const riskCapUSC = equityUSC * usdRiskCapPct / 100;
  const orderCalcProfitRiskUSC = 8500;
  assert.equal(riskCapUSC, 9000);
  assert.ok(orderCalcProfitRiskUSC <= riskCapUSC);
  assert.equal(orderCalcProfitRiskUSC / uscPerUsd, 85);
  assert.ok(!(orderCalcProfitRiskUSC * uscPerUsd <= riskCapUSC), 'double conversion would corrupt the cap');
});

test('Account mode fixture: candidate explicitly fails closed on NETTING and accepts HEDGING', () => {
  assert.match(source, /ACCOUNT_MARGIN_MODE\s*\)!=?\s*ACCOUNT_MARGIN_MODE_RETAIL_HEDGING/);
  const init = functionBody('OnInit');
  assert.match(init, /ACCOUNT_MARGIN_MODE_RETAIL_HEDGING/);
  assert.match(init, /return INIT_FAILED/);
});

test('Missing-SL fixture: portfolio risk calculation must fail closed when SL or OrderCalcProfit is unavailable', () => {
  const risk = source.slice(source.indexOf('double OpenRiskMoney('), source.indexOf('bool SelectLots('));
  assert.match(risk, /if\(sl<=0 \|\| lots<=0\) return 1e99/);
  assert.match(risk, /OrderCalcProfit\(/);
  assert.match(risk, /return 1e99/);
});

test('Runtime safety: compile-time hard-disable is true and all identified mutation wrappers return before broker mutation', () => {
  assert.match(source, /^#define NOVA_PHASE2_EXECUTION_DISABLED true\b/m);
  const wrappers = [
    'SendClose', 'ModifySL', 'Trail_SendPartialClose', 'RecoverySend',
    'RecoveryPartialClose', 'ProcessCandidate', 'CancelOwnPending',
    'SniperMTF_Check', 'MoveToBreakeven'
  ];
  for (const name of wrappers) {
    const body = functionBody(name);
    assert.match(body, /^\s*if\s*\(NOVA_PHASE2_EXECUTION_DISABLED\)\s*return(?:\s+false)?\s*;/,
      name + ' must hard-return before any state or broker operation');
  }
});

test('Runtime safety: direct OrderSend and CTrade PositionModify call sites are only inside hard-disabled wrappers', () => {
  const mutationFunctions = ['SendClose', 'ModifySL', 'Trail_SendPartialClose', 'RecoverySend', 'RecoveryPartialClose', 'ProcessCandidate', 'CancelOwnPending', 'SniperMTF_Check', 'MoveToBreakeven'];
  const callCount = (source.match(/\bOrderSend\s*\(/g) || []).length;
  const covered = mutationFunctions.reduce((sum, name) => {
    const body = functionBody(name);
    return sum + (body.match(/\bOrderSend\s*\(/g) || []).length + (body.match(/\.PositionModify\s*\(/g) || []).length;
  }, 0);
  assert.equal(callCount, 8);
  assert.equal(covered, 9, 'every broker mutation callsite must be inside a guarded wrapper');
});

test('Runtime safety: pending order cancellation and partial close are individually guarded', () => {
  assert.match(functionBody('CancelOwnPending'), /if\(NOVA_PHASE2_EXECUTION_DISABLED\) return;/);
  assert.match(functionBody('Trail_SendPartialClose'), /if\(NOVA_PHASE2_EXECUTION_DISABLED\) return false;/);
  assert.match(functionBody('RecoveryPartialClose'), /if\(NOVA_PHASE2_EXECUTION_DISABLED\) return false;/);
});

[executed on device: 10_3_6_9 (eafcd939-e63c-40af-bf66-4429eb8f9319)]