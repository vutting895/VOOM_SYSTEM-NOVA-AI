import { json, methodNotAllowed, resolveDemoConnection, hubRequest } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const query = event.queryStringParameters || {};
  const now = Math.floor(Date.now() / 1000);
  const toTs = query.to_ts === undefined ? now : Number(query.to_ts);
  const fromTs = query.from_ts === undefined ? now - 30 * 86400 : Number(query.from_ts);
  const limit = query.limit === undefined ? 200 : Number(query.limit);
  if (!Number.isSafeInteger(fromTs) || !Number.isSafeInteger(toTs) ||
      fromTs < 1 || toTs <= fromTs || toTs > now + 60 ||
      toTs - fromTs > 90 * 86400 ||
      !Number.isInteger(limit) || limit < 1 || limit > 500) {
    return json(400, { error: "invalid_history_range", maximumDays: 90, maximumRows: 500 });
  }
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const params = new URLSearchParams({ from_ts: String(fromTs), to_ts: String(toTs), limit: String(limit) });
  const result = await hubRequest(event, "/v1/connections/" + resolved.connection.connectionId + "/history?" + params);
  if (!result.ok) return result.response;
  return json(200, {
    ok: true,
    provider: "exness_mt5_demo",
    connectionId: resolved.connection.connectionId,
    deals: Array.isArray(result.data.deals) ? result.data.deals : [],
    count: Number.isInteger(result.data.count) ? result.data.count : 0,
    range: { from_ts: fromTs, to_ts: toTs },
    dataMode: "DEMO_READONLY",
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
};
