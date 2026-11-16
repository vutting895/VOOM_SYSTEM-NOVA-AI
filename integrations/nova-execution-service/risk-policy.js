export const NOVA_DEMO_RISK_POLICY = Object.freeze({
  version: "NOVA-RISK-POLICY-V2",
  environment: "demo_only",
  dailyLoss: Object.freeze({
    limitPct: 10,
    baseline: "broker_day_start_equity",
    action: "entry_lock_only",
    onLimit: Object.freeze(["reject_new_entries", "cancel_pending_entries", "retain_open_positions"])
  }),
  aggregateOpenRiskPct: 9,
  maximumOrders: 5,
  // These settings have not been explicitly approved; null must block readiness.
  perTradeRiskPct: null,
  allowedSymbols: null,
  allowedSessions: null,
  maxSpreadPoints: null,
  maxSlippagePoints: null,
  minStopDistance: null,
  minFreeMarginPct: null,
  cooldownSeconds: null,
  requireStopLoss: null,
  requireTakeProfit: null,
  partialFillPolicy: null
});

const REQUIRED_POLICY_FIELDS = Object.freeze([
  "perTradeRiskPct",
  "allowedSymbols",
  "allowedSessions",
  "maxSpreadPoints",
  "maxSlippagePoints",
  "minStopDistance",
  "minFreeMarginPct",
  "cooldownSeconds",
  "requireStopLoss",
  "requireTakeProfit",
  "partialFillPolicy"
]);

export function getRiskPolicyReadiness(policy = NOVA_DEMO_RISK_POLICY) {
  const missing = REQUIRED_POLICY_FIELDS.filter((field) => policy[field] === null || policy[field] === undefined);
  return Object.freeze({
    ready: missing.length === 0,
    state: missing.length === 0 ? "configured_pending_verification" : "blocked_incomplete_policy",
    policyVersion: policy.version,
    missingRequiredSettings: missing
  });
};
