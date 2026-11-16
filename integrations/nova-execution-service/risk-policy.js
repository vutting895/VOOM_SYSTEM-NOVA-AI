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

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function getRiskPolicyReadiness(policy = NOVA_DEMO_RISK_POLICY) {
  const missing = REQUIRED_POLICY_FIELDS.filter((field) => policy[field] === null || policy[field] === undefined);
  const invalid = [];

  if (policy.environment !== "demo_only") invalid.push("environment");
  if (!finiteNumber(policy.dailyLoss?.limitPct) || policy.dailyLoss.limitPct <= 0 || policy.dailyLoss.limitPct > 100) invalid.push("dailyLoss.limitPct");
  if (policy.dailyLoss?.baseline !== "broker_day_start_equity") invalid.push("dailyLoss.baseline");
  if (policy.dailyLoss?.action !== "entry_lock_only") invalid.push("dailyLoss.action");
  if (!Array.isArray(policy.dailyLoss?.onLimit) ||
      !["reject_new_entries", "cancel_pending_entries", "retain_open_positions"].every((item) => policy.dailyLoss.onLimit.includes(item))) {
    invalid.push("dailyLoss.onLimit");
  }
  if (!finiteNumber(policy.aggregateOpenRiskPct) || policy.aggregateOpenRiskPct <= 0 || policy.aggregateOpenRiskPct > 100) invalid.push("aggregateOpenRiskPct");
  if (!Number.isInteger(policy.maximumOrders) || policy.maximumOrders < 1) invalid.push("maximumOrders");

  if (policy.perTradeRiskPct !== null && policy.perTradeRiskPct !== undefined &&
      (!finiteNumber(policy.perTradeRiskPct) || policy.perTradeRiskPct <= 0 ||
       !finiteNumber(policy.aggregateOpenRiskPct) || policy.perTradeRiskPct > policy.aggregateOpenRiskPct)) {
    invalid.push("perTradeRiskPct");
  }
  if (policy.allowedSymbols !== null && policy.allowedSymbols !== undefined && !nonEmptyStringArray(policy.allowedSymbols)) invalid.push("allowedSymbols");
  if (policy.allowedSessions !== null && policy.allowedSessions !== undefined && !nonEmptyStringArray(policy.allowedSessions)) invalid.push("allowedSessions");
  if (policy.maxSpreadPoints !== null && policy.maxSpreadPoints !== undefined &&
      (!finiteNumber(policy.maxSpreadPoints) || policy.maxSpreadPoints < 0)) invalid.push("maxSpreadPoints");
  if (policy.maxSlippagePoints !== null && policy.maxSlippagePoints !== undefined &&
      (!finiteNumber(policy.maxSlippagePoints) || policy.maxSlippagePoints < 0)) invalid.push("maxSlippagePoints");
  if (policy.minStopDistance !== null && policy.minStopDistance !== undefined &&
      (!finiteNumber(policy.minStopDistance) || policy.minStopDistance <= 0)) invalid.push("minStopDistance");
  if (policy.minFreeMarginPct !== null && policy.minFreeMarginPct !== undefined &&
      (!finiteNumber(policy.minFreeMarginPct) || policy.minFreeMarginPct < 0 || policy.minFreeMarginPct > 100)) invalid.push("minFreeMarginPct");
  if (policy.cooldownSeconds !== null && policy.cooldownSeconds !== undefined &&
      (!Number.isInteger(policy.cooldownSeconds) || policy.cooldownSeconds < 0)) invalid.push("cooldownSeconds");
  if (policy.requireStopLoss !== null && policy.requireStopLoss !== undefined && policy.requireStopLoss !== true) invalid.push("requireStopLoss");
  if (policy.requireTakeProfit !== null && policy.requireTakeProfit !== undefined && policy.requireTakeProfit !== true) invalid.push("requireTakeProfit");
  if (policy.partialFillPolicy !== null && policy.partialFillPolicy !== undefined &&
      (typeof policy.partialFillPolicy !== "string" || !policy.partialFillPolicy.trim())) invalid.push("partialFillPolicy");

  const ready = missing.length === 0 && invalid.length === 0;
  return Object.freeze({
    ready,
    state: ready ? "configured_pending_verification" : "blocked_incomplete_policy",
    policyVersion: policy.version,
    missingRequiredSettings: missing,
    invalidSettings: invalid
  });
}
