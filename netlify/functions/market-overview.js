import { json, methodNotAllowed, resolveDemoConnection, hubRequest, normalizeTimeframe } from "../lib/system-hub.js";

const SYMBOLS = [
  { symbol: "XAUUSDm", displayName: "Gold Spot / US Dollar", category: "Metals" },
  { symbol: "BTCUSDm", displayName: "Bitcoin CFD", category: "Crypto" },
  { symbol: "EURUSDm", displayName: "Euro / US Dollar", category: "Forex" }
];

function atr(bars, digits) {
  const rows = bars.slice(-15);
  if (rows.length < 2) return 0;
  let total = 0, count = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const high = Number(rows[i].high), low = Number(rows[i].low), prev = Number(rows[i - 1].close);
    if (![high, low, prev].every(Number.isFinite)) continue;
    total += Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
    count += 1;
  }
  return count ? Number((total / count).toFixed(Math.max(0, Math.min(8, digits || 2)))) : 0;
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const resolved = await resolveDemoConnection(event);
  if (!resolved.ok) return resolved.response;
  const assets = [];
  const unavailable = [];
  for (const item of SYMBOLS) {
    const params = new URLSearchParams({ symbol: item.symbol, timeframe: "H1", count: "24" });
    const result = await hubRequest(event, "/v1/connections/" + resolved.connection.connectionId + "/quotes?" + params);
    if (!result.ok) { unavailable.push({ symbol: item.symbol, reason: "quote_unavailable" }); continue; }
    const quote = result.data.quote || {};
    const bars = Array.isArray(quote.bars) ? quote.bars : [];
    const closes = bars.map((bar) => Number(bar.close)).filter(Number.isFinite);
    const latest = Number(quote.tick?.last) > 0 ? Number(quote.tick.last) :
      (Number(quote.tick?.bid) > 0 && Number(quote.tick?.ask) > 0 ? (Number(quote.tick.bid) + Number(quote.tick.ask)) / 2 : closes.at(-1));
    if (!Number.isFinite(latest) || !bars.length) { unavailable.push({ symbol: item.symbol, reason: "quote_data_missing" }); continue; }
    const first = Number(bars[0].open), high = Math.max(...bars.map((bar) => Number(bar.high)).filter(Number.isFinite));
    const low = Math.min(...bars.map((bar) => Number(bar.low)).filter(Number.isFinite));
    const volume = bars.reduce((sum, bar) => sum + (Number(bar.tick_volume) || 0), 0);
    const digits = Number(quote.digits) || 2;
    const bid = Number(quote.tick?.bid), ask = Number(quote.tick?.ask);
    assets.push({
      symbol: item.symbol, displayName: item.displayName, category: item.category,
      price: latest, change24h: first > 0 ? Number((((latest - first) / first) * 100).toFixed(4)) : 0,
      high24h: Number.isFinite(high) ? high : latest, low24h: Number.isFinite(low) ? low : latest,
      volume24h: volume, spreadLabel: Number.isFinite(bid) && Number.isFinite(ask) ? (ask - bid).toFixed(digits) : "unavailable",
      atr14: atr(bars, digits), decimals: digits, feedSource: "Exness MT5 Demo",
      dataMode: "DEMO_READONLY"
    });
  }
  if (!assets.length) return json(502, { error: "market_data_unavailable", assets: [], unavailable, dataMode: "UNAVAILABLE" });
  return json(200, {
    ok: true, timestamp: new Date().toISOString(), dataMode: "DEMO_READONLY",
    safetyNotice: "AUTHENTICATED EXNESS DEMO MARKET DATA · READ-ONLY · LIVE TRADING OFF",
    assets, unavailable, ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false
  });
};
