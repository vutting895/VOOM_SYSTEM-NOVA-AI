import { json, methodNotAllowed, hubRequest } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const result = await hubRequest(event, "/v1/connections");
  if (!result.ok) return result.response;
  const connections = Array.isArray(result.data.connections) ? result.data.connections : [];
  const demo = connections.find((row) => row?.provider === "exness_mt5" && row?.environment === "demo");
  return json(200, {
    broker: "exness",
    status: demo?.status || "not_configured",
    connected: demo?.status === "connected",
    accountConnected: demo?.status === "connected",
    environment: "demo",
    mode: "read-only",
    dataVerified: false,
    connectionId: demo?.connectionId || null,
    ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false
  });
};
