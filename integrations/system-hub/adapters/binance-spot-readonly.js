const BASE_URL = "https://data-api.binance.vision";
const SYMBOL = /^[A-Z0-9]{5,20}$/;
const INTERVALS = new Set(["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"]);

function validateSymbol(value) {
  const symbol = String(value || "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) throw new TypeError("invalid_symbol");
  return symbol;
}
function validateLimit(value, fallback = 100) {
  const limit = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TypeError("limit_out_of_range");
  return limit;
}
function validateInterval(value) {
  const interval = String(value || "1m");
  if (!INTERVALS.has(interval)) throw new TypeError("unsupported_interval");
  return interval;
}
function decimalString(value) {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  return value;
}
function finiteTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
async function requestJson(path, params = {}, fetchImpl = fetch) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new Error("provider_unavailable");
  }
  if (!response.ok) {
    const status = response.status;
    throw new Error(status === 429 ? "provider_rate_limited"
      : status >= 500 ? "provider_unavailable" : "provider_request_rejected");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("provider_invalid_response");
  }
}

export const binanceSpotReadonly = Object.freeze({
  providerId: "binance_spot",
  environment: "public",
  capabilities: Object.freeze([
    "market.instruments.read",
    "market.quote.read",
    "market.candles.read"
  ]),
  async getTickerPrice({ symbol, fetchImpl } = {}) {
    const safeSymbol = validateSymbol(symbol);
    const payload = await requestJson("/api/v3/ticker/price", { symbol: safeSymbol }, fetchImpl);
    if (!payload || payload.symbol !== safeSymbol) throw new Error("provider_invalid_response");
    const price = decimalString(payload.price);
    if (price === null) throw new Error("provider_invalid_response");
    return {
      provider: "binance_spot",
      capability: "market.quote.read",
      symbol: safeSymbol,
      price,
      asOf: null,
      receivedAt: new Date().toISOString(),
      source: "binance.spot.ticker_price",
      mode: "read-only",
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false
    };
  },
  async getCandles({ symbol, interval = "1m", limit = 100, fetchImpl } = {}) {
    const safeSymbol = validateSymbol(symbol);
    const safeInterval = validateInterval(interval);
    const safeLimit = validateLimit(limit);
    const payload = await requestJson("/api/v3/klines", {
      symbol: safeSymbol,
      interval: safeInterval,
      limit: safeLimit
    }, fetchImpl);
    if (!Array.isArray(payload) || payload.length > safeLimit) throw new Error("provider_invalid_response");
    const candles = payload.map((row) => {
      if (!Array.isArray(row) || row.length < 7) throw new Error("provider_invalid_response");
      const openTime = finiteTimestamp(row[0]);
      const closeTime = finiteTimestamp(row[6]);
      const open = decimalString(row[1]);
      const high = decimalString(row[2]);
      const low = decimalString(row[3]);
      const close = decimalString(row[4]);
      const volume = decimalString(row[5]);
      if ([openTime, closeTime, open, high, low, close, volume].some((v) => v === null)) {
        throw new Error("provider_invalid_response");
      }
      const values = [open, high, low, close].map(Number);
      if (values.some((v) => !Number.isFinite(v) || v <= 0) ||
          Number(high) < Math.max(Number(open), Number(close), Number(low)) ||
          Number(low) > Math.min(Number(open), Number(close), Number(high)) ||
          Number(volume) < 0 || closeTime < openTime) {
        throw new Error("provider_invalid_response");
      }
      return { openTime, closeTime, open, high, low, close, volume };
    });
    for (let i = 1; i < candles.length; i += 1) {
      if (candles[i].openTime <= candles[i - 1].openTime) throw new Error("provider_invalid_response");
    }
    return {
      provider: "binance_spot",
      capability: "market.candles.read",
      symbol: safeSymbol,
      interval: safeInterval,
      candles,
      count: candles.length,
      asOf: candles.length ? new Date(candles[candles.length - 1].closeTime).toISOString() : null,
      receivedAt: new Date().toISOString(),
      source: "binance.spot.klines",
      mode: "read-only",
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false
    };
  },
  async getExchangeInfo({ symbol, fetchImpl } = {}) {
    const safeSymbol = validateSymbol(symbol);
    const payload = await requestJson("/api/v3/exchangeInfo", { symbol: safeSymbol }, fetchImpl);
    const item = Array.isArray(payload?.symbols) ? payload.symbols.find((entry) => entry.symbol === safeSymbol) : null;
    if (!item || typeof item.status !== "string" || typeof item.baseAsset !== "string" ||
        typeof item.quoteAsset !== "string") throw new Error("provider_invalid_response");
    return {
      provider: "binance_spot",
      capability: "market.instruments.read",
      symbol: safeSymbol,
      status: item.status,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      source: "binance.spot.exchange_info",
      mode: "read-only",
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false
    };
  }
});
