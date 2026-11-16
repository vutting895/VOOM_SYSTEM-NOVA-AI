import test from "node:test";
import assert from "node:assert/strict";
import { NOVA_DEMO_RISK_POLICY, getRiskPolicyReadiness } from "../risk-policy.js";

test("NOVA Demo Risk Policy v2 preserves the explicitly approved limits", () => {
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

test("a complete explicit policy may become configured but is not execution approval", () => {
  const complete = { ...NOVA_DEMO_RISK_POLICY };
  for (const field of ["perTradeRiskPct", "allowedSymbols", "allowedSessions", "maxSpreadPoints", "maxSlippagePoints", "minStopDistance", "minFreeMarginPct", "cooldownSeconds", "requireStopLoss", "requireTakeProfit", "partialFillPolicy"]) {
    complete[field] = field === "allowedSymbols" || field === "allowedSessions" ? ["XAUUSDm"] : 1;
  }
  const readiness = getRiskPolicyReadiness(complete);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.state, "configured_pending_verification");
});
