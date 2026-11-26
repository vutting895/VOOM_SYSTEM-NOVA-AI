export const TRADING_SAFETY_FLAGS = Object.freeze({
  ordersEnabled: false,
  executionEnabled: false,
  liveTradingEnabled: false
});

const READ_ONLY_CAPABILITIES = new Set([
  "mt5.account.read",
  "mt5.quotes.read"
]);
const MUTATING_CAPABILITIES = new Set([
  "broker.order.submit",
  "broker.order.modify",
  "broker.order.cancel",
  "broker.position.close",
  "broker.position.modify",
  "account.funds.transfer",
  "account.funds.withdraw"
]);

function deny(reason, capability) {
  return Object.freeze({ allowed: false, decision: "deny", reason, capability });
}

export function authorizeCapability({ principal, connection, capability } = {}) {
  if (!principal || typeof principal.userId !== "string" || !principal.userId) {
    return deny("authenticated_principal_required", capability);
  }
  if (MUTATING_CAPABILITIES.has(capability)) {
    return deny("execution_disabled", capability);
  }
  if (!READ_ONLY_CAPABILITIES.has(capability)) {
    return deny("capability_not_allowlisted", capability);
  }
  if (!connection || typeof connection !== "object") {
    return deny("connection_not_found", capability);
  }
  if (connection.user_id !== principal.userId) {
    return deny("connection_not_owned", capability);
  }
  if (connection.provider !== "exness_mt5" || connection.environment !== "demo") {
    return deny("environment_not_allowed", capability);
  }
  if (connection.status !== "connected" || typeof connection.bridge_route_id !== "string" || !connection.bridge_route_id) {
    return deny("connection_not_ready", capability);
  }
  return Object.freeze({
    allowed: true,
    decision: "allow",
    reason: "owner_scoped_read_only_capability",
    capability,
    ...TRADING_SAFETY_FLAGS
  });
}
