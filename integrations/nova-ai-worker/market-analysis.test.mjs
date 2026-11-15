import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarketBars, analyzeSmcResearch, validateMarketBars } from "./market-analysis.js";

function candles(direction = "up", count = 120) {
  const start = Date.now() - (count - 1) * 60_000;
  let previous = 2000;
  return Array.from({ length: count }, (_, index) => {
    const close = direction === "down" ? 2000 - index * 0.4
      : direction === "flat" ? 2000 + (index % 2 ? 0.05 : -0.05)
        : 2000 + index * 0.4;
    const open = previous;
    previous = close;
    return {
      time: new Date(start + index * 60_000).toISOString(),
      open,
      high: Math.max(open, close) + 0.2,
      low: Math.min(open, close) - 0.2,
      close
    };
  });
}

test("verified rising candles produce a research-only bullish watch", () => {
  const result = analyzeMarketBars(candles("up"));
  assert.equal(result.ok, true);
  assert.equal(result.trend, "bullish");
  assert.equal(result.momentum, "bullish");
  assert.equal(result.bias, "bullish");
  assert.equal(result.signal, "bullish_watch");
  assert.equal(result.classification, "research_only_not_an_order");
  assert.equal(result.barCount, 119);
  assert.equal(result.currentBarExcluded, true);
  assert.equal(result.smc.ok, true);
  assert.equal(result.smc.ordersSubmitted, false);
  assert.ok(result.indicators.ema20 > result.indicators.ema50);
  assert.ok(result.indicators.rsi14 > 55);
});

test("verified falling candles produce a research-only bearish watch", () => {
  const result = analyzeMarketBars(candles("down"));
  assert.equal(result.ok, true);
  assert.equal(result.trend, "bearish");
  assert.equal(result.momentum, "bearish");
  assert.equal(result.bias, "bearish");
  assert.equal(result.signal, "bearish_watch");
});

test("mixed or flat candles do not fabricate a directional watch", () => {
  const result = analyzeMarketBars(candles("flat"));
  assert.equal(result.ok, true);
  assert.equal(result.signal, "neutral");
  assert.equal(result.classification, "research_only_not_an_order");
});

test("history below the minimum is rejected", () => {
  const result = validateMarketBars(candles("up", 59));
  assert.equal(result.ok, false);
  assert.equal(result.error, "insufficient_or_excessive_market_history");
});

test("duplicate or non-chronological candle timestamps are rejected", () => {
  const rows = candles("up");
  rows[50].time = rows[49].time;
  const result = validateMarketBars(rows);
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_market_candle");
});

test("invalid OHLC bounds and non-finite values are rejected", () => {
  const rows = candles("up");
  rows[70].high = rows[70].low - 1;
  const result = validateMarketBars(rows);
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_market_candle");
});


function smcSampleBars() {
  const closes = [10, 9, 8, 9, 11, 10, 9, 12, 13, 11, 10, 14, 15, 13, 12, 16, 17, 15, 14, 18];
  return closes.map((close, index) => {
    const open = index % 2 ? close - 0.4 : close + 0.4;
    return { open, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, close };
  });
}

test("SMC research port returns deterministic structure and never an order", () => {
  const bars = smcSampleBars();
  const first = analyzeSmcResearch(bars);
  const second = analyzeSmcResearch(bars);
  assert.equal(first.ok, true);
  assert.equal(first.version, "smc-js-research-1.0.0");
  assert.equal(first.signal, null);
  assert.equal(first.ordersSubmitted, false);
  assert.equal(first.liveTradingEnabled, false);
  assert.deepEqual(first, second);
  assert.ok(Array.isArray(first.structureEvents));
  assert.ok(Array.isArray(first.fairValueGaps));
  assert.ok(Array.isArray(first.orderBlocks));
  assert.ok(Array.isArray(first.liquiditySweeps));
});

test("SMC research port rejects malformed or short candle history", () => {
  assert.equal(analyzeSmcResearch(smcSampleBars().slice(0, 9)).ok, false);
  const invalid = smcSampleBars();
  invalid[0].high = invalid[0].low - 1;
  assert.equal(analyzeSmcResearch(invalid).ok, false);
});
