export function findExnessDemoConnection(payload) {
  if (!payload || !Array.isArray(payload.connections)) return null;
  return payload.connections.find((item) =>
    item && item.provider === "exness_mt5" && item.environment === "demo"
  ) || null;
}

export function isProvisionedDemoConnection(connection) {
  return Boolean(
    connection &&
    connection.recordStatus === "connected" &&
    connection.bridgeAllocated === true
  );
}

export function normalizeReadOnlyQuote(payload) {
  if (!payload || payload.dataVerified !== true ||
      payload.ordersEnabled !== false ||
      payload.liveTradingEnabled !== false) return null;

  const quote = payload.quote;
  if (!quote || quote.mode !== "read-only" ||
      quote.order_submission_enabled !== false ||
      !Array.isArray(quote.bars)) return null;

  const bars = quote.bars.filter((bar) =>
    bar && typeof bar.time === "string" &&
    ["open", "high", "low", "close"].every((key) =>
      typeof bar[key] === "number" && Number.isFinite(bar[key])
    ) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high)
  );

  if (!bars.length) return null;

  const tick = quote.tick && ["bid", "ask"].every((key) =>
    typeof quote.tick[key] === "number" && Number.isFinite(quote.tick[key])
  ) ? quote.tick : null;

  return {
    symbol: typeof quote.symbol === "string" ? quote.symbol : "",
    timeframe: typeof quote.timeframe === "string" ? quote.timeframe : "",
    digits: Number.isInteger(quote.digits) ? quote.digits : null,
    tick,
    bars,
    asOf: typeof quote.as_of === "string" ? quote.as_of : null,
  };
}

export function quoteFreshness(tickTime, now = Date.now(), maxAgeMs = 5 * 60 * 1000) {
  if (typeof tickTime !== "string") return "unknown";
  const timestamp = Date.parse(tickTime);
  if (!Number.isFinite(timestamp)) return "unknown";
  const age = now - timestamp;
  if (age < -60_000) return "unknown";
  return age <= maxAgeMs ? "fresh" : "stale";
}
