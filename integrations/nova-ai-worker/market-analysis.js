const MIN_BARS = 60;
const MAX_BARS = 500;

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateMarketBars(bars) {
  if (!Array.isArray(bars) || bars.length < MIN_BARS || bars.length > MAX_BARS) {
    return { ok: false, error: "insufficient_or_excessive_market_history" };
  }
  const normalized = [];
  let previousTime = -Infinity;
  for (let index = 0; index < bars.length; index += 1) {
    const row = bars[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: "invalid_market_candle" };
    }
    const time = typeof row.time === "string" ? Date.parse(row.time) : NaN;
    const { open, high, low, close } = row;
    if (
      !Number.isFinite(time) || time <= previousTime ||
      ![open, high, low, close].every(finitePositive) ||
      high < low || open < low || open > high || close < low || close > high
    ) {
      return { ok: false, error: "invalid_market_candle" };
    }
    previousTime = time;
    normalized.push({ time: row.time, timeMs: time, open, high, low, close });
  }
  return { ok: true, candles: normalized };
}

function ema(values, period) {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    value = values[index] * alpha + value * (1 - alpha);
  }
  return value;
}

function wilderAverage(values, period) {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let index = period; index < values.length; index += 1) {
    value = ((value * (period - 1)) + values[index]) / period;
  }
  return value;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  const gains = [];
  const losses = [];
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const averageGain = wilderAverage(gains, period);
  const averageLoss = wilderAverage(losses, period);
  if (averageGain === null || averageLoss === null) return null;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  if (averageGain === 0) return 0;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  return wilderAverage(ranges, period);
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

/**
 * Deterministic, data-only indicator analysis. It emits research bias, never an order.
 * Inputs must already be owner-scoped and verified by the System Integration Hub.
 */
export function analyzeMarketBars(bars) {
  const checked = validateMarketBars(bars);
  if (!checked.ok) return checked;
  const candles = checked.candles;
  const closes = candles.map((candle) => candle.close);
  const lastClose = closes.at(-1);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  if (![ema20, ema50, rsi14, atr14].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { ok: false, error: "indicator_calculation_unavailable" };
  }

  const trend = ema20 > ema50 && lastClose > ema20
    ? "bullish"
    : ema20 < ema50 && lastClose < ema20
      ? "bearish"
      : "neutral";
  const momentum = rsi14 >= 55 ? "bullish" : rsi14 <= 45 ? "bearish" : "neutral";
  const bias = trend === momentum && trend !== "neutral" ? trend : "neutral";
  const signal = bias === "bullish" ? "bullish_watch"
    : bias === "bearish" ? "bearish_watch" : "neutral";
  return {
    ok: true,
    barCount: candles.length,
    asOf: candles.at(-1).time,
    lastClose: round(lastClose),
    indicators: {
      ema20: round(ema20),
      ema50: round(ema50),
      rsi14: round(rsi14, 4),
      atr14: round(atr14),
      atrPct: round((atr14 / lastClose) * 100, 4)
    },
    trend,
    momentum,
    bias,
    signal,
    confluence: trend === momentum && trend !== "neutral" ? 2 : (trend !== "neutral" || momentum !== "neutral" ? 1 : 0),
    classification: "research_only_not_an_order"
  };
}
