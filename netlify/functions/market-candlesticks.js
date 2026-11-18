import { json, methodNotAllowed, resolveDemoConnection, hubRequest, normalizeMt5Symbol, normalizeTimeframe } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const query = event.queryStringParameters || {};
  let symbol, timeframe;
  const limit = query.limit === undefined ? 36 : Number(query.limit);
  try {
    symbol = normalizeMt5Symbol(query.symbol, "XAUUSDm");
    timeframe = normalizeTimeframe(query.timeframe, "M15");
  } catch (error) { return json(400, { error: error.message }); }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return json(400, { error: "invalid_limit" });
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const params = new URLSearchParams({ symbol, timeframe, count: String(limit) });
  const result = await hubRequest(event, "/v1/connections/" + resolved.connection.connectionId + "/quotes?" + params);
  if (!result.ok) return result.response;
  const quote = result.data.quote || {};
  const bars = Array.isArray(quote.bars) ? quote.bars.map((bar) => {
    const rawTime = bar.time;
    const timeMs = typeof rawTime === "number"
      ? (rawTime > 1e12 ? rawTime : rawTime * 1000)
      : Date.parse(String(rawTime));
    const open = Number(bar.open);
    const close = Number(bar.close);
    return {
      time: Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : String(rawTime || ""),
      timestamp: Number.isFinite(timeMs) ? Math.floor(timeMs / 1000) : 0,
      open, high: Number(bar.high), low: Number(bar.low), close,
      volume: Number(bar.tick_volume) || 0,
      isBullish: Number.isFinite(open) && Number.isFinite(close) && close >= open
    };
  }) : [];
  if (!bars.length) return json(502, { error: "candles_unavailable", dataVerified: false });
  return json(200, {
    ok: true, symbol, timeframe, dataMode: "DEMO_READONLY", bars,
    ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false
  });
};
