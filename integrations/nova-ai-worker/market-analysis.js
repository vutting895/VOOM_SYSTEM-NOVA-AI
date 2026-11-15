const MIN_BARS = 61;
const MAX_BARS = 500;

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateMarketBars(bars) {
  // MT5 returns the current forming candle as the final bar. Require 61 so
  // at least 60 completed bars remain after excluding that unfinished candle.
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
  return 100 - (100 / (1 + averageGain / averageLoss));
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

function validateSmcCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 10) return false;
  return candles.every((row) => row &&
    [row.open, row.high, row.low, row.close].every((value) => typeof value === "number" && Number.isFinite(value)) &&
    row.high >= row.low && row.low <= row.open && row.open <= row.high &&
    row.low <= row.close && row.close <= row.high);
}

/**
 * Deterministic SMC research port aligned to workers/feature/smc_wave/smc_strategy.py.
 * Uses only the supplied completed bars. It produces structure candidates, never orders.
 */
export function analyzeSmcResearch(candles) {
  if (!validateSmcCandles(candles)) return { ok: false, error: "invalid_smc_candles" };
  const n = candles.length;
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const tr = candles.map((c, index) => {
    const previous = index ? closes[index - 1] : closes[index];
    return Math.max(c.high - c.low, Math.abs(c.high - previous), Math.abs(c.low - previous));
  });
  const atrPeriod = Math.min(14, n);
  const atrValue = tr.slice(-atrPeriod).reduce((sum, value) => sum + value, 0) / atrPeriod;

  const pivots = [];
  const left = 2;
  const right = 2;
  for (let index = left; index < n - right; index += 1) {
    const window = candles.slice(index - left, index + right + 1);
    const windowHighs = window.map((item) => item.high);
    const windowLows = window.map((item) => item.low);
    if (highs[index] === Math.max(...windowHighs) && windowHighs.filter((v) => v === highs[index]).length === 1) {
      pivots.push({ index, confirmedAt: index + right, kind: "high", price: highs[index] });
    }
    if (lows[index] === Math.min(...windowLows) && windowLows.filter((v) => v === lows[index]).length === 1) {
      pivots.push({ index, confirmedAt: index + right, kind: "low", price: lows[index] });
    }
  }
  pivots.sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));
  const confirmed = pivots.filter((pivot) => pivot.confirmedAt < n);
  const events = [];
  let structureBias = "neutral";
  const lastBroken = new Set();
  let latestStructure = null;
  let pivotCursor = 0;
  const latestPivot = { high: null, low: null };
  for (let index = Math.max(left + right + 1, 1); index < n; index += 1) {
    while (pivotCursor < confirmed.length && confirmed[pivotCursor].confirmedAt < index) {
      const pivot = confirmed[pivotCursor];
      latestPivot[pivot.kind] = pivot;
      pivotCursor += 1;
    }
    for (const [kind, direction] of [["high", "bullish"], ["low", "bearish"]]) {
      const level = latestPivot[kind];
      if (!level || level.index >= index) continue;
      const key = kind + ":" + level.index;
      const broke = kind === "high" ? closes[index] > level.price : closes[index] < level.price;
      if (broke && !lastBroken.has(key)) {
        lastBroken.add(key);
        const eventType = structureBias !== "neutral" && structureBias !== direction ? "CHoCH" : "BOS";
        events.push({
          type: eventType, direction, index, level: level.price,
          swingIndex: level.index, close: closes[index], confirmedPivotOnly: true
        });
        structureBias = direction;
        latestStructure = events.at(-1);
      }
    }
  }

  const suffixMin = Array(n).fill(0);
  const suffixMax = Array(n).fill(0);
  suffixMin[n - 1] = lows[n - 1];
  suffixMax[n - 1] = highs[n - 1];
  for (let index = n - 2; index >= 0; index -= 1) {
    suffixMin[index] = Math.min(lows[index], suffixMin[index + 1]);
    suffixMax[index] = Math.max(highs[index], suffixMax[index + 1]);
  }

  const fvgs = [];
  for (let index = 2; index < n; index += 1) {
    const futureMin = index + 1 < n ? suffixMin[index + 1] : null;
    const futureMax = index + 1 < n ? suffixMax[index + 1] : null;
    if (lows[index] > highs[index - 2]) {
      fvgs.push({
        type: "bullish_fvg", index, lower: highs[index - 2], upper: lows[index],
        midpoint: (highs[index - 2] + lows[index]) / 2,
        mitigated: futureMin !== null && futureMin <= lows[index]
      });
    }
    if (highs[index] < lows[index - 2]) {
      fvgs.push({
        type: "bearish_fvg", index, lower: highs[index], upper: lows[index - 2],
        midpoint: (highs[index] + lows[index - 2]) / 2,
        mitigated: futureMax !== null && futureMax >= highs[index]
      });
    }
  }

  const orderBlocks = [];
  for (const event of events) {
    const index = event.index;
    const bullish = event.direction === "bullish";
    const start = Math.max(0, index - 8);
    const candidates = [];
    for (let j = start; j < index; j += 1) {
      if (bullish ? closes[j] < opens[j] : closes[j] > opens[j]) candidates.push(j);
    }
    if (!candidates.length) continue;
    const candleIndex = candidates.at(-1);
    const displacement = Math.abs(closes[index] - opens[index]);
    if (atrValue > 0 && displacement < atrValue) continue;
    orderBlocks.push({
      type: bullish ? "bullish_order_block" : "bearish_order_block",
      index: candleIndex, confirmedAt: index, lower: lows[candleIndex], upper: highs[candleIndex],
      structureEvent: event.type, displacement, atrAtAnalysis: atrValue,
      mitigatedAfterConfirmation: index + 1 < n && (bullish
        ? suffixMin[index + 1] <= lows[candleIndex]
        : suffixMax[index + 1] >= highs[candleIndex])
    });
  }

  const sweeps = [];
  pivotCursor = 0;
  latestPivot.high = null;
  latestPivot.low = null;
  for (let index = 1; index < n; index += 1) {
    while (pivotCursor < confirmed.length && confirmed[pivotCursor].confirmedAt < index) {
      const pivot = confirmed[pivotCursor];
      latestPivot[pivot.kind] = pivot;
      pivotCursor += 1;
    }
    const highPivot = latestPivot.high;
    const lowPivot = latestPivot.low;
    if (highPivot && highs[index] > highPivot.price && closes[index] < highPivot.price) {
      sweeps.push({ type: "buy_side_liquidity_sweep", index, level: highPivot.price, swingIndex: highPivot.index });
    }
    if (lowPivot && lows[index] < lowPivot.price && closes[index] > lowPivot.price) {
      sweeps.push({ type: "sell_side_liquidity_sweep", index, level: lowPivot.price, swingIndex: lowPivot.index });
    }
  }

  const latestFvg = [...fvgs].reverse().find((item) => !item.mitigated) || null;
  const latestOb = [...orderBlocks].reverse().find((item) => !item.mitigatedAfterConfirmation) || null;
  const latestSweep = sweeps.at(-1) || null;
  let confluenceCount = latestStructure ? 1 : 0;
  if (latestFvg && ((structureBias === "bullish" && latestFvg.type === "bullish_fvg") ||
      (structureBias === "bearish" && latestFvg.type === "bearish_fvg"))) confluenceCount += 1;
  if (latestOb && ((structureBias === "bullish" && latestOb.type === "bullish_order_block") ||
      (structureBias === "bearish" && latestOb.type === "bearish_order_block"))) confluenceCount += 1;
  if (latestSweep && ((structureBias === "bullish" && latestSweep.type === "sell_side_liquidity_sweep") ||
      (structureBias === "bearish" && latestSweep.type === "buy_side_liquidity_sweep"))) confluenceCount += 1;

  return {
    ok: true,
    version: "smc-js-research-1.0.0",
    barsAnalyzed: n,
    structureBias,
    latestStructureEvent: latestStructure,
    latestUnmitigatedFvg: latestFvg,
    latestUnmitigatedOrderBlock: latestOb,
    latestLiquiditySweep: latestSweep,
    confluenceCount,
    setupCandidate: Boolean(latestStructure && confluenceCount >= 2),
    swingPoints: confirmed.slice(-30),
    structureEvents: events.slice(-30),
    fairValueGaps: fvgs.slice(-30),
    orderBlocks: orderBlocks.slice(-30),
    liquiditySweeps: sweeps.slice(-30),
    signal: null,
    ordersSubmitted: false,
    liveTradingEnabled: false,
    limitations: [
      "Research candidate only; no profitability claim.",
      "OB/FVG definitions are explicit heuristic baselines requiring review.",
      "Backtest, walk-forward and out-of-sample validation required before signal use."
    ]
  };
}

/**
 * Deterministic analysis from verified MT5 candles. The last bar is excluded because
 * MT5's copy_rates_from_pos(..., start_pos=0, ...) includes the current forming candle.
 */
export function analyzeMarketBars(bars) {
  const checked = validateMarketBars(bars);
  if (!checked.ok) return checked;
  const allCandles = checked.candles;
  const candles = allCandles.slice(0, -1);
  if (candles.length < 60) return { ok: false, error: "insufficient_completed_market_history" };
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
  const smc = analyzeSmcResearch(candles);
  if (!smc.ok) return { ok: false, error: "smc_analysis_unavailable" };
  return {
    ok: true,
    barCount: candles.length,
    asOf: candles.at(-1).time,
    currentBarExcluded: true,
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
    smc,
    classification: "research_only_not_an_order"
  };
}
