const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const SYMBOL = /^[A-Za-z0-9._-]{1,40}$/;
const MAX_CANDLES = 500;
const MIN_CANDLES = 35;
const MAX_BODY_BYTES = 128 * 1024;

export function parseAnalysisPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("invalid_json_object"), { status: 400 });
  }
  const symbol = typeof value.symbol === "string" ? value.symbol.trim() : "";
  const timeframe = typeof value.timeframe === "string" ? value.timeframe.trim().toUpperCase() : "";
  if (!SYMBOL.test(symbol)) throw Object.assign(new Error("invalid_symbol"), { status: 400 });
  if (!TIMEFRAMES.has(timeframe)) throw Object.assign(new Error("unsupported_timeframe"), { status: 400 });
  if (!Array.isArray(value.candles) || value.candles.length < MIN_CANDLES || value.candles.length > MAX_CANDLES) {
    throw Object.assign(new Error("candle_count_out_of_range"), { status: 400 });
  }

  let previousTime = -Infinity;
  const candles = value.candles.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw Object.assign(new Error("invalid_candle"), { status: 400 });
    }
    const time = typeof item.t === "string" ? Date.parse(item.t) : item.t;
    const candle = { t: time, o: item.o, h: item.h, l: item.l, c: item.c, v: item.v };
    if (!Number.isSafeInteger(candle.t) || candle.t <= 0 || candle.t <= previousTime) {
      throw Object.assign(new Error("candle_timestamps_must_be_ascending_epoch_ms"), { status: 400 });
    }
    previousTime = candle.t;
    for (const key of ["o", "h", "l", "c", "v"]) {
      if (typeof candle[key] !== "number" || !Number.isFinite(candle[key])) {
        throw Object.assign(new Error("invalid_candle_" + key), { status: 400 });
      }
    }
    if (candle.o <= 0 || candle.h <= 0 || candle.l <= 0 || candle.c <= 0 || candle.v < 0 ||
      candle.h < candle.l || candle.h < candle.o || candle.h < candle.c ||
      candle.l > candle.o || candle.l > candle.c) {
      throw Object.assign(new Error("inconsistent_ohlcv_candle"), { status: 400 });
    }
    return candle;
  });
  return { symbol, timeframe, candles };
}

function sma(values, period) {
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}
function emaSeries(values, period) {
  const alpha = 2 / (period + 1);
  const output = [];
  let current = values[0];
  output.push(current);
  for (let i = 1; i < values.length; i += 1) {
    current = values[i] * alpha + current * (1 - alpha);
    output.push(current);
  }
  return output;
}
function rsi(values, period = 14) {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}
function atr(candles, period = 14) {
  const ranges = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previousClose = candles[i - 1].c;
    ranges.push(Math.max(
      current.h - current.l,
      Math.abs(current.h - previousClose),
      Math.abs(current.l - previousClose)
    ));
  }
  let value = ranges.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let i = period; i < ranges.length; i += 1) {
    value = (value * (period - 1) + ranges[i]) / period;
  }
  return value;
}

export function analyzeCandles(input) {
  const { symbol, timeframe, candles } = parseAnalysisPayload(input);
  const closes = candles.map((candle) => candle.c);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdSeries = ema12.map((value, index) => value - ema26[index]);
  const macdSignal = emaSeries(macdSeries, 9).at(-1);
  const macd = macdSeries.at(-1);
  const histogram = macd - macdSignal;
  const latest = candles.at(-1);
  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const bullishTrend = ema12.at(-1) > ema26.at(-1) && sma5 > sma20;
  const bearishTrend = ema12.at(-1) < ema26.at(-1) && sma5 < sma20;
  const bullishMomentum = rsi14 >= 50 && rsi14 < 70 && histogram > 0;
  const bearishMomentum = rsi14 <= 50 && rsi14 > 30 && histogram < 0;
  const signal = bullishTrend && bullishMomentum ? "BUY"
    : bearishTrend && bearishMomentum ? "SELL" : "HOLD";
  const aligned = signal === "HOLD" ? 0
    : Number(bullishTrend || bearishTrend) + Number(bullishMomentum || bearishMomentum);
  const trendSpreadPct = Math.abs(ema12.at(-1) - ema26.at(-1)) / latest.c;
  const confidence = signal === "HOLD" ? 0.5
    : Math.min(0.95, 0.55 + Math.min(trendSpreadPct * 10, 0.2) + (aligned === 2 ? 0.1 : 0));

  const reasons = [
    "Deterministic technical-indicator rules; not an ML prediction or calibrated probability.",
    "EMA12 " + (ema12.at(-1) > ema26.at(-1) ? "above" : ema12.at(-1) < ema26.at(-1) ? "below" : "equal to") + " EMA26.",
    "SMA5 " + (sma5 > sma20 ? "above" : sma5 < sma20 ? "below" : "equal to") + " SMA20.",
    "RSI14=" + rsi14.toFixed(2) + "; MACD histogram=" + histogram.toFixed(8) + ".",
    signal === "HOLD" ? "Trend and momentum conditions are not aligned; no directional signal." : "Trend and momentum conditions are aligned for the rule-based " + signal + " signal."
  ];

  return {
    api_version: "1.0.0",
    symbol,
    timeframe,
    signal,
    confidence: Number(confidence.toFixed(4)),
    confidence_type: "heuristic_score_not_probability",
    predicted_price: null,
    model_version: "technical-rules-v1",
    reasons,
    indicators: {
      sma5: Number(sma5.toFixed(8)),
      sma20: Number(sma20.toFixed(8)),
      ema12: Number(ema12.at(-1).toFixed(8)),
      ema26: Number(ema26.at(-1).toFixed(8)),
      rsi14: Number(rsi14.toFixed(4)),
      atr14: Number(atr14.toFixed(8)),
      macd: Number(macd.toFixed(8)),
      macd_signal: Number(macdSignal.toFixed(8)),
      macd_histogram: Number(histogram.toFixed(8))
    },
    input: {
      candle_count: candles.length,
      first_candle_at: new Date(candles[0].t).toISOString(),
      last_candle_at: new Date(latest.t).toISOString(),
      source: "client_supplied_ohlcv"
    },
    executionEnabled: false,
    ordersEnabled: false,
    liveTradingEnabled: false
  };
}

export async function readAnalysisRequest(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw Object.assign(new Error("application_json_required"), { status: 415 });
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error("request_body_too_large"), { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error("request_body_too_large"), { status: 413 });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}
