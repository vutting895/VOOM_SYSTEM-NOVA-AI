import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCandles, parseAnalysisPayload, readAnalysisRequest } from "../analysis.js";

function candles(count = 60, trend = 1) {
  return Array.from({ length: count }, (_, index) => {
    const close = 2000 + index * trend * 0.7 + Math.sin(index / 3) * 0.08;
    return {
      t: 1790000000000 + index * 3600000,
      o: close - 0.1,
      h: close + 0.3,
      l: close - 0.3,
      c: close,
      v: 100 + index
    };
  });
}
const payload = (trend = 1) => ({ symbol: "XAUUSDm", timeframe: "H1", candles: candles(60, trend) });

test("returns deterministic read-only analysis for valid OHLCV", () => {
  const result = analyzeCandles(payload());
  assert.equal(result.api_version, "1.0.0");
  assert.equal(result.symbol, "XAUUSDm");
  assert.equal(result.predicted_price, null);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
  assert.ok(["BUY", "SELL", "HOLD"].includes(result.signal));
  assert.equal(analyzeCandles(payload()).signal, result.signal);
});

test("rejects too few candles", () => {
  assert.throws(() => parseAnalysisPayload({ ...payload(), candles: candles(34) }), { message: "candle_count_out_of_range" });
});

test("rejects unsupported timeframe and malformed OHLC", () => {
  assert.throws(() => parseAnalysisPayload({ ...payload(), timeframe: "W1" }), { message: "unsupported_timeframe" });
  const invalid = payload();
  invalid.candles[5].h = invalid.candles[5].l - 1;
  assert.throws(() => parseAnalysisPayload(invalid), { message: "inconsistent_ohlcv_candle" });
});

test("rejects duplicate or out-of-order timestamps", () => {
  const invalid = payload();
  invalid.candles[10].t = invalid.candles[9].t;
  assert.throws(() => parseAnalysisPayload(invalid), { message: "candle_timestamps_must_be_ascending_epoch_ms" });
});

test("rejects oversized or non-JSON requests", async () => {
  await assert.rejects(() => readAnalysisRequest(new Request("https://example.test", {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}"
  })), { message: "application_json_required" });
  await assert.rejects(() => readAnalysisRequest(new Request("https://example.test", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{"
  })), { message: "invalid_json" });
});
