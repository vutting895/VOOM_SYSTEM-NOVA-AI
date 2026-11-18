import { json, methodNotAllowed, resolveDemoConnection, hubRequest } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const result = await hubRequest(event, "/v1/connections/" + resolved.connection.connectionId + "/portfolio");
  if (!result.ok) return result.response;
  return json(200, {
    ok: true,
    provider: "exness_mt5_demo",
    connectionId: resolved.connection.connectionId,
    account: result.data.account,
    positions: Array.isArray(result.data.positions) ? result.data.positions : [],
    dataMode: "DEMO_READONLY",
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
};
