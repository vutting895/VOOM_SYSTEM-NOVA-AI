import { json, methodNotAllowed, hubRequest, resolveDemoConnection, normalizeMt5Symbol, normalizeTimeframe } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const query = event.queryStringParameters || {};
  const provider = String(query.provider || (String(query.symbol || "").toUpperCase().endsWith("USDT") ? "binance" : "exness")).toLowerCase();

  if (provider === "binance") {
    const symbol = String(query.symbol || "BTCUSDT").trim().replaceAll("/", "").toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return json(400, { error: "invalid_symbol" });
    try {
      const url = new URL("https://data-api.binance.vision/api/v3/ticker/price");
      url.searchParams.set("symbol", symbol);
      const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data || data.symbol !== symbol || !/^\d+(\.\d+)?$/.test(String(data.price))) {
        return json(502, { error: "binance_public_price_unavailable", provider: "binance_spot_public" });
      }
      return json(200, {
        ok: true, provider: "binance_spot_public", symbol,
        price: data.price, dataMode: "PUBLIC_MARKET_DATA",
        ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
        asOf: new Date().toISOString()
      });
    } catch {
      return json(502, { error: "binance_public_price_unavailable", provider: "binance_spot_public" });
    }
  }

  if (provider !== "exness") return json(400, { error: "unsupported_provider" });
  let symbol, timeframe;
  try {
    symbol = normalizeMt5Symbol(query.symbol, "XAUUSDm");
    timeframe = normalizeTimeframe(query.timeframe, "M1");
  } catch (error) { return json(400, { error: error.message }); }
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const params = new URLSearchParams({ symbol, timeframe, count: "1" });
  const result = await hubRequest(event, "/v1/connections/" + resolved.connection.connectionId + "/quotes?" + params);
  if (!result.ok) return result.response;
  const quote = result.data.quote || {};
  const bid = Number(quote.tick?.bid);
  const ask = Number(quote.tick?.ask);
  const last = Number(quote.tick?.last);
  const price = Number.isFinite(last) && last > 0 ? last :
    (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : null);
  if (price === null) return json(502, { error: "broker_price_missing", dataVerified: false });
  return json(200, {
    ok: true, provider: "exness_mt5_demo", connectionId: resolved.connection.connectionId,
    symbol, price, bid: Number.isFinite(bid) ? bid : null, ask: Number.isFinite(ask) ? ask : null,
    asOf: quote.tick?.time || quote.as_of || null, dataMode: "DEMO_READONLY",
    ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false
  });
};
