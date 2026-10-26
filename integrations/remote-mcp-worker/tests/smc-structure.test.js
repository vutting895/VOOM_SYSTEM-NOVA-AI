import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSmcCandles } from "../src/index.js";

const bars = [
  {open:9, high:10, low:8, close:9},
  {open:10, high:12, low:9, close:11},
  {open:8, high:11, low:7, close:8},
  {open:9, high:10, low:8, close:9},
  {open:10, high:11, low:9, close:10},
  {open:11, high:13, low:10, close:13},
  {open:6, high:12, low:5, close:6},
  {open:8, high:10, low:6, close:8},
  {open:10, high:11, low:7, close:10},
  {open:13, high:14, low:9, close:14},
];

test("SMC structure labels alternate BOS then CHoCH on direction changes", () => {
  const result = analyzeSmcCandles(bars, 1, 1);
  const events = result.structure_events;
  assert.equal(events[0].direction, "bullish");
  assert.equal(events[0].type, "BOS");
  assert.equal(events[1].direction, "bearish");
  assert.equal(events[1].type, "CHoCH");
  assert.equal(events[2].direction, "bullish");
  assert.equal(events[2].type, "CHoCH");
  assert.equal(result.orders_submitted, false);
  assert.equal(result.live_trading_enabled, false);
});

test("SMC rejects malformed OHLC ranges", () => {
  const malformed = bars.map(x => ({...x}));
  malformed[0] = {open:12, high:10, low:8, close:9};
  assert.throws(() => analyzeSmcCandles(malformed, 1, 1), /Invalid OHLC bounds/);
});
