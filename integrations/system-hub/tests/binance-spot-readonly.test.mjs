import test from "node:test";
import assert from "node:assert/strict";
import { binanceSpotReadonly } from "../adapters/binance-spot-readonly.js";

const kline = (time = 1700000000000) => [
  time, "100.00", "110.00", "90.00", "105.00", "12.50",
  time + 59999, "1300.00", 42, "6.00", "620.00", "0"
];

function fakeFetch(payload, status = 200, inspect = () => {}) {
  return async (url, init) => {
    inspect(new URL(url), init);
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  };
}

test("ticker uses fixed public host and GET only, without API credentials", async () => {
  const result = await binanceSpotReadonly.getTickerPrice({
    symbol: "btcusdt",
    fetchImpl: fakeFetch({ symbol: "BTCUSDT", price: "67234.12000000" }, 200, (url, init) => {
      assert.equal(url.origin, "https://data-api.binance.vision");
      assert.equal(url.pathname, "/api/v3/ticker/price");
      assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers["X-MBX-APIKEY"], undefined);
      assert.equal(init.redirect, "error");
    })
  });
  assert.equal(result.price, "67234.12000000");
  assert.equal(result.provider, "binance_spot");
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});

test("candles are bounded, normalized, chronological and read-only", async () => {
  const result = await binanceSpotReadonly.getCandles({
    symbol: "BTCUSDT", interval: "5m", limit: 2,
    fetchImpl: fakeFetch([kline(1700000000000), kline(1700000300000)], 200, (url, init) => {
      assert.equal(url.pathname, "/api/v3/klines");
      assert.equal(url.searchParams.get("limit"), "2");
      assert.equal(url.searchParams.get("interval"), "5m");
      assert.equal(init.method, "GET");
    })
  });
  assert.equal(result.count, 2);
  assert.equal(result.candles[0].open, "100.00");
  assert.equal(result.candles[1].openTime, 1700000300000);
  assert.equal(result.ordersEnabled, false);
});

test("exchange info returns only normalized instrument metadata", async () => {
  const result = await binanceSpotReadonly.getExchangeInfo({
    symbol: "BTCUSDT",
    fetchImpl: fakeFetch({ symbols: [{ symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT" }] })
  });
  assert.deepEqual(
    { symbol: result.symbol, baseAsset: result.baseAsset, quoteAsset: result.quoteAsset },
    { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }
  );
});

test("rejects invalid symbol, interval and excessive candle count before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call network"); };
  await assert.rejects(() => binanceSpotReadonly.getTickerPrice({ symbol: "../order", fetchImpl }), /invalid_symbol/);
  await assert.rejects(() => binanceSpotReadonly.getCandles({ symbol: "BTCUSDT", interval: "1h;POST", fetchImpl }), /unsupported_interval/);
  await assert.rejects(() => binanceSpotReadonly.getCandles({ symbol: "BTCUSDT", limit: 501, fetchImpl }), /limit_out_of_range/);
  assert.equal(calls, 0);
});

test("provider errors are sanitized and rate limits are explicit", async () => {
  await assert.rejects(
    () => binanceSpotReadonly.getTickerPrice({ symbol: "BTCUSDT", fetchImpl: fakeFetch({}, 429) }),
    /provider_rate_limited/
  );
  await assert.rejects(
    () => binanceSpotReadonly.getTickerPrice({ symbol: "BTCUSDT", fetchImpl: fakeFetch({}, 503) }),
    /provider_unavailable/
  );
});

test("malformed, inconsistent or out-of-order candle data fails closed", async () => {
  const malformed = kline();
  malformed[2] = "80.00"; // high below open
  await assert.rejects(
    () => binanceSpotReadonly.getCandles({ symbol: "BTCUSDT", fetchImpl: fakeFetch([malformed]) }),
    /provider_invalid_response/
  );
  await assert.rejects(
    () => binanceSpotReadonly.getCandles({ symbol: "BTCUSDT", fetchImpl: fakeFetch([kline(), kline()]) }),
    /provider_invalid_response/
  );
});

test("unsupported provider payloads never become trusted empty data", async () => {
  await assert.rejects(
    () => binanceSpotReadonly.getTickerPrice({ symbol: "BTCUSDT", fetchImpl: fakeFetch({ symbol: "ETHUSDT", price: "1" }) }),
    /provider_invalid_response/
  );
  await assert.rejects(
    () => binanceSpotReadonly.getExchangeInfo({ symbol: "BTCUSDT", fetchImpl: fakeFetch({ symbols: [] }) }),
    /provider_invalid_response/
  );
});
