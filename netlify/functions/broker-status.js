import { json, methodNotAllowed, resolveDemoConnection, hubRequest } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const result = await hubRequest(
    event,
    "/v1/connections/" + resolved.connection.connectionId + "/check",
    { method: "POST" }
  );
  if (!result.ok) return result.response;
  return json(200, {
    broker: "exness",
    status: result.data.state || "unavailable",
    connected: result.data.dataVerified === true,
    accountConnected: result.data.dataVerified === true,
    environment: "demo",
    mode: "read-only",
    dataVerified: result.data.dataVerified === true,
    connectionId: resolved.connection.connectionId,
    ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false
  });
};
