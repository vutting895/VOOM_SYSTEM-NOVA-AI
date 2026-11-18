import { json, methodNotAllowed } from "../lib/system-hub.js";

// Deliberately fail-closed. This endpoint is a safety boundary, not a broker adapter.
export const handler = async (event) => {
  if (!["POST"].includes(event.httpMethod)) return methodNotAllowed(["POST"]);
  return json(403, {
    ok: false,
    error: "BROKER_WRITES_DISABLED",
    detail: "Trade submission is disabled. No request is forwarded to any exchange or broker.",
    mode: "read-only",
    testnetOnly: true,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
};
