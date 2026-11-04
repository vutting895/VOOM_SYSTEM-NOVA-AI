const READ_ONLY_FLAGS = Object.freeze({
  liveTradingEnabled: false, mode: 'read-only', tradingEnabled: false,
  ordersEnabled: false, executionEnabled: false, environment: 'demo', mt5BridgeEnabled: false,
});

export function getTradingSafetySnapshot(updatedAt = new Date().toISOString()) {
  return { ...READ_ONLY_FLAGS, detail: 'NOVA is restricted to Exness Demo / read-only analysis. Live order execution is disabled.', updatedAt };
}

export function getOrderExecutionBlockedResponse() {
  return { ok: false, code: 'LIVE_EXECUTION_DISABLED', message: 'Order submission is disabled. NOVA is operating in read-only Demo mode.', liveTradingEnabled: false, ordersEnabled: false, executionMode: 'read-only' };
}

export function getBrokerUnverifiedSnapshot(broker = 'unknown', checkedAt = new Date().toISOString()) {
  return { broker, status: 'unverified', connected: false, accountConnected: false, accountId: null, environment: 'demo', mt5BridgeEnabled: false, mt5BridgeStatus: 'disabled', capabilities: [], checkedAt, mode: 'read-only', tradingEnabled: false, ordersEnabled: false };
}

export function getCredentialIntakeDisabledResponse() {
  return { ok: false, code: 'BROKER_CREDENTIAL_INTAKE_DISABLED', message: 'Broker credentials are not accepted by this endpoint. Use an approved broker-authentication flow; never paste credentials into NOVA chat or settings.' };
}

export function isLiveExecutionEnableRequest(body) { return body?.enabled === true; }
