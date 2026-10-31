import test from "node:test";
import assert from "node:assert/strict";
import {
  findExnessDemoConnection,
  isProvisionedDemoConnection,
  normalizeReadOnlyQuote,
  quoteFreshness,
} from "../frontend/lib/trading-market-data.js";

test("selects only the authenticated user's Exness Demo connection shape", () => {
  const connection = { provider: "exness_mt5", environment: "demo", recordStatus: "connected", bridgeAllocated: true };
  assert.equal(findExnessDemoConnection({ connections: [
    { ...connection, environment: "live" },
    { ...connection, provider: "other" },
    connection,
  ] }), connection);
  assert.equal(findExnessDemoConnection({ connections: [] }), null);
  assert.equal(findExnessDemoConnection(null), null);
});

test("requires a connected record and dedicated bridge allocation", () => {
  assert.equal(isProvisionedDemoConnection({ recordStatus: "connected", bridgeAllocated: true }), true);
  assert.equal(isProvisionedDemoConnection({ recordStatus: "pending", bridgeAllocated: true }), false);
  assert.equal(isProvisionedDemoConnection({ recordStatus: "connected", bridgeAllocated: false }), false);
});

test("accepts only verified read-only quote payloads", () => {
  const payload = {
    dataVerified: true, ordersEnabled: false, liveTradingEnabled: false,
    quote: {
      symbol: "XAUUSD", timeframe: "M5", digits: 2, mode: "read-only",
      order_submission_enabled: false, as_of: "2026-10-31T10:00:00Z",
      tick: { bid: 2700.1, ask: 2700.3, time: "2026-10-31T10:00:00Z" },
      bars: [{ time: "2026-10-31T09:55:00Z", open: 2699, high: 2701, low: 2698, close: 2700 }],
    },
  };
  assert.equal(normalizeReadOnlyQuote(payload).bars.length, 1);
  assert.equal(normalizeReadOnlyQuote({ ...payload, ordersEnabled: true }), null);
  assert.equal(normalizeReadOnlyQuote({ ...payload, liveTradingEnabled: true }), null);
  assert.equal(normalizeReadOnlyQuote({ ...payload, dataVerified: false }), null);
  assert.equal(normalizeReadOnlyQuote({ ...payload, quote: { ...payload.quote, order_submission_enabled: true } }), null);
});

test("drops malformed OHLC bars and rejects payloads with no valid bars", () => {
  const payload = {
    dataVerified: true, ordersEnabled: false, liveTradingEnabled: false,
    quote: {
      mode: "read-only", order_submission_enabled: false,
      bars: [
        { time: "2026-10-31T09:55:00Z", open: 10, high: 12, low: 9, close: 11 },
        { time: "bad", open: 10, high: 8, low: 9, close: 11 },
      ],
    },
  };
  assert.equal(normalizeReadOnlyQuote(payload).bars.length, 1);
  assert.equal(normalizeReadOnlyQuote({ ...payload, quote: { ...payload.quote, bars: [payload.quote.bars[1]] } }), null);
});

test("marks old provider ticks stale instead of calling them live", () => {
  const now = Date.parse("2026-10-31T10:00:00Z");
  assert.equal(quoteFreshness("2026-10-31T09:59:00Z", now), "fresh");
  assert.equal(quoteFreshness("2026-10-31T09:50:00Z", now), "stale");
  assert.equal(quoteFreshness(null, now), "unknown");
});
