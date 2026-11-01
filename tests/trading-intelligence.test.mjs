import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTradingToolRequest,
  decodeMcpToolResponse,
  normalizeMarketPayload,
  calculatePriceAnalysis
} from "../frontend/lib/trading-intelligence.mjs";

function makeBars(count = 40) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.45 + Math.sin(index / 2) * 1.2;
    return {
      time: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.9,
      close,
      volume: 1000 + index
    };
  });
}

test("market request builder allows only bounded MT5 read-only quotes", () => {
  assert.deepEqual(buildTradingToolRequest({
    action: "market_data", source: "mt5", symbol: "XAUUSDm", timeframe: "M5", count: 150
  }), {
    name: "mt5_quotes",
    arguments: { symbol: "XAUUSDm", timeframe: "M5", count: 150 }
  });
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "mt5", symbol: "../api/orders", timeframe: "M5", count: 150
  }));
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "mt5", symbol: "XAUUSDm", timeframe: "W1", count: 150
  }));
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "mt5", symbol: "XAUUSDm", timeframe: "M5", count: 501
  }));
});

test("market request builder allows only bounded Binance public candles", () => {
  assert.deepEqual(buildTradingToolRequest({
    action: "market_data", source: "binance", symbol: "btcusdt", timeframe: "1h", count: 100
  }), {
    name: "read_market_candles",
    arguments: { symbol: "BTCUSDT", interval: "1h", limit: 100 }
  });
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "binance", symbol: "BTCUSDT", timeframe: "1w", count: 100
  }));
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "binance", symbol: "BTCUSDT", timeframe: "1h", count: 5
  }));
});

test("request builder rejects every unrecognized action and source", () => {
  assert.throws(() => buildTradingToolRequest({ action: "place_order" }));
  assert.throws(() => buildTradingToolRequest({
    action: "market_data", source: "unknown", symbol: "BTCUSDT", timeframe: "1h", count: 100
  }));
  assert.throws(() => buildTradingToolRequest(null));
});

test("MCP response decoder accepts the current text content envelope", () => {
  const result = decodeMcpToolResponse({
    jsonrpc: "2.0",
    id: "nova",
    result: {
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ source: "Binance public market data", candles: [] }) }]
    }
  });
  assert.equal(result.source, "Binance public market data");
  assert.deepEqual(result.candles, []);
});

test("MCP response decoder fails closed for RPC, tool and malformed JSON errors", () => {
  assert.throws(() => decodeMcpToolResponse({ error: { message: "unauthorized" } }));
  assert.throws(() => decodeMcpToolResponse({
    result: { isError: true, content: [{ type: "text", text: "failed" }] }
  }));
  assert.throws(() => decodeMcpToolResponse({
    result: { isError: false, content: [{ type: "text", text: "not-json" }] }
  }));
});

test("MT5 market response normalization preserves provider data and read-only flags", () => {
  const bars = makeBars(35);
  const normalized = normalizeMarketPayload("mt5", {
    status: "ok",
    symbol: "XAUUSDm",
    timeframe: "M5",
    data: {
      symbol: "XAUUSDm",
      timeframe: "M5",
      digits: 2,
      tick: { bid: 3000.1, ask: 3000.3, last: 3000.2, time: bars.at(-1).time },
      bars,
      as_of: "2026-11-01T05:00:00.000Z"
    }
  });
  assert.equal(normalized.status, "data_verified");
  assert.equal(normalized.source, "Exness MT5 Demo");
  assert.equal(normalized.symbol, "XAUUSDm");
  assert.equal(normalized.bars.length, 35);
  assert.equal(normalized.executionEnabled, false);
  assert.equal(normalized.liveTradingEnabled, false);
  assert.equal(normalized.ordersEnabled, false);
});

test("MT5 pending bridge state is unavailable rather than fabricated", () => {
  const normalized = normalizeMarketPayload("mt5", {
    status: "pending_provisioning",
    message: "dedicated Bridge route not provisioned"
  });
  assert.equal(normalized.status, "pending_provisioning");
  assert.equal(normalized.bars.length, 0);
  assert.match(normalized.message, /Bridge route/);
  assert.equal(normalized.ordersEnabled, false);
});

test("Binance candle normalization accepts epoch timestamps and rejects invalid bars", () => {
  const valid = makeBars(30).map((bar) => ({ ...bar, time: Date.parse(bar.time) }));
  valid.push({ time: Date.now(), open: 2, high: 1, low: 3, close: 2, volume: 10 });
  const normalized = normalizeMarketPayload("binance", {
    source: "Binance public market data", symbol: "BTCUSDT", interval: "1h", candles: valid
  });
  assert.equal(normalized.status, "data_verified");
  assert.equal(normalized.bars.length, 30);
  assert.equal(normalized.source, "Binance public market data");
  assert.equal(normalized.ordersEnabled, false);
});

test("price analysis excludes the newest potentially unfinished candle", () => {
  const bars = makeBars(40);
  const analysis = calculatePriceAnalysis(bars);
  assert.equal(analysis.ready, true);
  assert.equal(analysis.barsUsed, 39);
  assert.equal(analysis.candles.length, 39);
  assert.equal(analysis.candles.at(-1).time, Date.parse(bars.at(-2).time));
  assert.equal(analysis.lastClose, bars.at(-2).close);
  assert.equal(analysis.orderSignal, null);
});

test("price analysis clearly identifies insufficient history and never emits an order signal", () => {
  const analysis = calculatePriceAnalysis(makeBars(20));
  assert.equal(analysis.ready, false);
  assert.equal(analysis.orderSignal, null);
  assert.match(analysis.reason, /28 bars/);
});

test("authenticated API checks bearer token before parsing request body", async () => {
  const routeUrl = new URL("../frontend/app/api/trading-intelligence/route.js", import.meta.url);
  const route = await readFile(routeUrl, "utf8");
  const authCheck = route.indexOf("if (!/^Bearer");
  const bodyParse = route.indexOf("input = await request.json()");
  assert.notEqual(authCheck, -1);
  assert.notEqual(bodyParse, -1);
  assert.ok(authCheck < bodyParse, "authentication must precede request body parsing");
  assert.match(route, /redirect: "error"/);
  assert.match(route, /cache: "no-store"/);
  assert.match(route, /MCP_ENDPOINT = "https:\/\/voom-system-mcp\.suwapat787\.workers\.dev\/mcp"/);
  assert.doesNotMatch(route, /request\.headers\.get\(["'](?:x-upstream-url|x-mcp-url)/i);
});


import { validateNeuralInferenceResult } from "../frontend/lib/neural-inference-contract.mjs";

function validNeuralResult() {
  const hash = "a".repeat(64);
  return {
    schemaVersion: "nova.neural-inference.v1",
    model: { id: "synthetic-test-model", version: "0.0.0-test", status: "validated", runtime: "pytorch", artifactSha256: hash },
    data: {
      symbol: "XAUUSDm", timeframe: "M5", datasetSha256: hash,
      featureManifestSha256: hash, barsUsed: 128, lastClosedBarAt: "2026-11-01T05:00:00.000Z"
    },
    evaluation: {
      status: "passed", finalOosUntouched: true, finalOosManifestSha256: hash,
      walkForwardFolds: 5, closedTrades: 30, netProfitAfterCosts: 1,
      profitFactor: 1.1,
      calibration: { status: "validated", manifestSha256: hash, brierScore: 0.2, expectedCalibrationError: 0.05 }
    },
    output: {
      regime: "bullish", probabilities: { bullish: 0.6, bearish: 0.2, sideways: 0.2 },
      generatedAt: "2026-11-01T05:00:01.000Z"
    }
  };
}

test("Neural inference contract requires model, data, OOS and calibration provenance", () => {
  const validated = validateNeuralInferenceResult(validNeuralResult(), {
    symbol: "XAUUSDm", timeframe: "M5", lastClosedBarAt: "2026-11-01T05:00:00.000Z"
  });
  assert.equal(validated.model.runtime, "pytorch");
  assert.equal(validated.output.regime, "bullish");
  assert.equal(validated.executionEnabled, false);
  assert.equal(validated.liveTradingEnabled, false);
  assert.equal(validated.ordersEnabled, false);
  assert.equal(Object.isFrozen(validated), true);
});

test("Neural inference contract rejects unvalidated, mismatched or uncalibrated outputs", () => {
  const unvalidated = validNeuralResult();
  unvalidated.model.status = "prototype";
  assert.throws(() => validateNeuralInferenceResult(unvalidated), /not validated/);

  const mismatched = validNeuralResult();
  assert.throws(() => validateNeuralInferenceResult(mismatched, { symbol: "BTCUSDT" }), /symbol does not match/);

  const uncalibrated = validNeuralResult();
  uncalibrated.evaluation.calibration.status = "missing";
  assert.throws(() => validateNeuralInferenceResult(uncalibrated), /evaluation.*calibration gates/);
});

test("Neural inference contract rejects weak OOS evidence and broker instructions", () => {
  const weak = validNeuralResult();
  weak.evaluation.profitFactor = 1;
  assert.throws(() => validateNeuralInferenceResult(weak), /evaluation.*OOS/);

  const unsafe = validNeuralResult();
  unsafe.order = { symbol: "XAUUSDm", side: "buy" };
  assert.throws(() => validateNeuralInferenceResult(unsafe), /must not contain broker/);

  const badProbability = validNeuralResult();
  badProbability.output.probabilities.bullish = 0.9;
  assert.throws(() => validateNeuralInferenceResult(badProbability), /probabilities/);
});
