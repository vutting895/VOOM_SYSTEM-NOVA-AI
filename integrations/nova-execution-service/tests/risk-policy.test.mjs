import test from "node:test";
import assert from "node:assert/strict";
import { NOVA_DEMO_RISK_POLICY, getRiskPolicyReadiness } from "../risk-policy.js";

test("NOVA Demo Risk Policy v2 preserves the previously specified limits", () => {
  assert.equal(NOVA_DEMO_RISK_POLICY.environment, "demo_only");
  assert.equal(NOVA_DEMO_RISK_POLICY.dailyLoss.limitPct, 10);
  assert.equal(NOVA_DEMO_RISK_POLICY.dailyLoss.baseline, "broker_day_start_equity");
  assert.equal(NOVA_DEMO_RISK_POLICY.dailyLoss.action, "entry_lock_only");
  assert.deepEqual(NOVA_DEMO_RISK_POLICY.dailyLoss.onLimit, ["reject_new_entries", "cancel_pending_entries", "retain_open_positions"]);
  assert.equal(NOVA_DEMO_RISK_POLICY.aggregateOpenRiskPct, 9);
  assert.equal(NOVA_DEMO_RISK_POLICY.maximumOrders, 5);
});

test("unapproved risk settings keep the policy blocked", () => {
  const readiness = getRiskPolicyReadiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.state, "blocked_incomplete_policy");
  assert.ok(readiness.missingRequiredSettings.includes("perTradeRiskPct"));
  assert.ok(readiness.missingRequiredSettings.includes("maxSpreadPoints"));
  assert.ok(readiness.missingRequiredSettings.includes("requireStopLoss"));
  assert.ok(readiness.missingRequiredSettings.includes("partialFillPolicy"));
});

test("a structurally valid explicit policy becomes configured but not execution-approved", () => {
  const complete = {
    ...NOVA_DEMO_RISK_POLICY,
    perTradeRiskPct: 1,
    allowedSymbols: ["XAUUSDm"],
    allowedSessions: ["LONDON"],
    maxSpreadPoints: 30,
    maxSlippagePoints: 10,
    minStopDistance: 50,
    minFreeMarginPct: 100,
    cooldownSeconds: 60,
    requireStopLoss: true,
    requireTakeProfit: true,
    partialFillPolicy: "reject_remainder"
  };
  const readiness = getRiskPolicyReadiness(complete);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.state, "configured_pending_verification");
  assert.deepEqual(readiness.invalidSettings, []);
});

test("invalid numeric values, empty allowlists and disabled protection block readiness", () => {
  const invalid = {
    ...NOVA_DEMO_RISK_POLICY,
    perTradeRiskPct: 12,
    allowedSymbols: [],
    allowedSessions: [""],
    maxSpreadPoints: -1,
    maxSlippagePoints: "unlimited",
    minStopDistance: 0,
    minFreeMarginPct: 101,
    cooldownSeconds: -2,
    requireStopLoss: false,
    requireTakeProfit: false,
    partialFillPolicy: ""
  };
  const readiness = getRiskPolicyReadiness(invalid);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.state, "blocked_incomplete_policy");
  for (const field of ["perTradeRiskPct", "allowedSymbols", "allowedSessions", "maxSpreadPoints", "maxSlippagePoints", "minStopDistance", "minFreeMarginPct", "cooldownSeconds", "requireStopLoss", "requireTakeProfit", "partialFillPolicy"]) {
    assert.ok(readiness.invalidSettings.includes(field), field + " must be rejected");
  }
});

test("risk policy cannot be repurposed for Live Trading", () => {
  const livePolicy = { ...NOVA_DEMO_RISK_POLICY, environment: "live" };
  const readiness = getRiskPolicyReadiness(livePolicy);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.invalidSettings.includes("environment"));
});
