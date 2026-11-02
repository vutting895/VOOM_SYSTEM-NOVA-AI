import test from "node:test";
import assert from "node:assert/strict";
import {
  createExnessGetHeaders,
  createExnessReadOnlyAdapter,
  EXNESS_READ_ONLY_FLAGS
} from "../exness-readonly-adapter.js";

const PRIVATE_KEY_HEX = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const CONTEXT = { ownerId: "user-a", connectionId: "connection-a" };
const CREDENTIALS = {
  apiKey: "exnsk-synthetic-example",
  privateKey: PRIVATE_KEY_HEX,
  accountId: "123456",
  discoveryBaseUrl: "https://gateway.exness.com"
};

test("Ed25519 signed GET headers match the Exness published synthetic test vector", async () => {
  const headers = await createExnessGetHeaders({
    apiKey: CREDENTIALS.apiKey,
    privateKey: CREDENTIALS.privateKey,
    timestamp: 1773656070123,
    path: "/v1/trading/access-point?account_id=123456"
  });
  assert.equal(headers["EXN-API-KEY"], "exnsk-synthetic-example");
  assert.equal(headers["EXN-IDEMPOTENCY-KEY"], "");
  assert.equal(headers["EXN-TIMESTAMP"], "1773656070123");
  assert.equal(headers["EXN-SIGN-VERSION"], "1");
  assert.equal(headers["EXN-DATA"], "eyJhcGlfa2V5IjoiZXhuc2stc3ludGhldGljLWV4YW1wbGUiLCJpZGVtcG90ZW5jeV9rZXkiOiIiLCJ0aW1lc3RhbXAiOjE3NzM2NTYwNzAxMjMsInNpZ25fdmVyc2lvbiI6MSwibWV0aG9kIjoiR0VUIiwicGF0aCI6Ii92MS90cmFkaW5nL2FjY2Vzcy1wb2ludD9hY2NvdW50X2lkPTEyMzQ1NiIsImJvZHlfaGFzaCI6IjQ3REVRcGo4SEJTYS1fVEltVy01SkNldVFlUmttNU5NcEpXWkczaFN1RlUifQ");
  assert.equal(headers["EXN-SIGN"], "l-H_Acia8YoTjKFMg-3fon3NOEX8TalNVA7c01DQ9dHb7pVBJC4y06qC-DbpETzh1KToiOprqEV6uzN3t69ICQ");
});

test("adapter resolves only owner-scoped credentials and performs signed GET discovery/account reads", async () => {
  const calls = [];
  let resolverCalls = 0;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async (input) => {
      resolverCalls += 1;
      assert.deepEqual(input, {
        ownerId: "user-a",
        connectionId: "connection-a",
        provider: "exness_trader_api"
      });
      return CREDENTIALS;
    },
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      calls.push({ url: parsed, init });
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers["EXN-IDEMPOTENCY-KEY"], "");
      if (parsed.pathname === "/v1/trading/access-point") {
        assert.equal(parsed.search, "?account_id=123456");
        return Response.json({ account_id: 123456, access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname === "/v1/configuration/accounts/123456/account") {
        return Response.json({ account_id: "123456", currency: "USD" });
      }
      throw new Error("Unexpected upstream path");
    }
  });

  const account = await adapter.getAccount(CONTEXT);
  assert.equal(account.account_id, "123456");
  assert.equal(account.currency, "USD");
  assert.equal(resolverCalls, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.hostname, "gateway.exness.com");
  assert.equal(calls[1].url.hostname, "ap-test.exness.com");
  assert.ok(calls.every((call) => call.init.method === "GET"));
});

test("instrument list is validated and exposes only the returned account instruments", async () => {
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname.endsWith("/instruments")) {
        return Response.json({ instruments: ["EURUSD", "XAUUSD"] });
      }
      throw new Error("Unexpected upstream path");
    }
  });
  assert.deepEqual(await adapter.getInstruments(CONTEXT), ["EURUSD", "XAUUSD"]);
});

test("missing credential resolver or owner-scoped secret fails closed without upstream calls", async () => {
  assert.throws(() => createExnessReadOnlyAdapter({}), /credential_resolver_unavailable/);
  let upstreamCalled = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => null,
    fetchImpl: async () => { upstreamCalled = true; throw new Error("must not call"); }
  });
  await assert.rejects(adapter.getAccount(CONTEXT), /credential_vault_unavailable/);
  assert.equal(upstreamCalled, false);
});

test("untrusted access point host is rejected before account request", async () => {
  let accountRequested = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "evil.example" });
      }
      accountRequested = true;
      throw new Error("must not reach an untrusted host");
    }
  });
  await assert.rejects(adapter.getAccount(CONTEXT), /exness_access_point_invalid/);
  assert.equal(accountRequested, false);
});

test("unsupported account IDs and mutating methods are not exposed by the adapter", async () => {
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => ({ ...CREDENTIALS, accountId: "123;456" }),
    fetchImpl: async () => { throw new Error("must not call"); }
  });
  await assert.rejects(adapter.getAccount(CONTEXT), /credential_vault_unavailable/);
  assert.deepEqual(EXNESS_READ_ONLY_FLAGS, {
    ordersEnabled: false,
    executionEnabled: false,
    order_submission_enabled: false,
    liveTradingEnabled: false
  });
  assert.equal("placeOrder" in adapter, false);
  assert.equal("modifyOrder" in adapter, false);
  assert.equal("closePosition" in adapter, false);
});

test("candles are bounded, account-instrument scoped, chronologically validated GET reads", async () => {
  const paths = [];
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      paths.push(parsed.pathname + parsed.search);
      assert.equal(init.method, "GET");
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname.endsWith("/instruments")) {
        return Response.json({ instruments: ["EURUSD"] });
      }
      if (parsed.pathname.endsWith("/limits")) return Response.json({ limits: { rest: { methods: [{ http_method: "GET", path: "/v1/market-data/accounts/{account_id}/candles", limits: { max_candles_per_request: 100, history_age_days: 365 } }] } } });
      if (parsed.pathname.endsWith("/candles")) {
        assert.equal(parsed.searchParams.get("instrument"), "EURUSD");
        assert.equal(parsed.searchParams.get("timeframe"), "M5");
        assert.equal(parsed.searchParams.get("count"), "2");
        assert.equal(parsed.searchParams.get("price_type"), "bid");
        return Response.json({ candles: [
          { time: "2026-10-31T00:00:00.000Z", open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
          { time: "2026-10-31T00:05:00.000Z", open: 1.15, high: 1.25, low: 1.1, close: 1.2, volume: 11 }
        ] });
      }
      throw new Error("Unexpected upstream path");
    }
  });
  const candles = await adapter.getCandles(CONTEXT, {
    instrument: "EURUSD", timeframe: "M5", from: "2026-10-31T00:00:00.000Z", count: 2
  });
  assert.equal(candles.length, 2);
  assert.equal(paths.length, 4);
  assert.ok(paths.some((path) => path.startsWith("/v1/market-data/accounts/123456/candles?")));
});

test("candle request rejects unlisted instruments, invalid ranges and oversized counts", async () => {
  let upstreamCalls = 0;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url) => {
      upstreamCalls += 1;
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname.endsWith("/instruments")) return Response.json({ instruments: ["EURUSD"] });
      if (parsed.pathname.endsWith("/limits")) return Response.json({ limits: { rest: { methods: [{ http_method: "GET", path: "/v1/market-data/accounts/{account_id}/candles", limits: { max_candles_per_request: 100, history_age_days: 365 } }] } } });
      throw new Error("Candle request must not run");
    }
  });
  await assert.rejects(adapter.getCandles(CONTEXT, {
    instrument: "XAUUSD", timeframe: "M5", from: "2026-10-31T00:00:00.000Z", count: 5
  }), /exness_instrument_not_available/);
  await assert.rejects(adapter.getCandles(CONTEXT, {
    instrument: "EURUSD", timeframe: "M5", from: "2026-10-31T00:00:00.000Z", count: 501
  }), /exness_candle_query_outside_account_limits/);
  assert.equal(upstreamCalls, 5);
});


test("accepts account-configured candle limits above 999 without a hardcoded three-digit cap", async () => {
  let candleRequested = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname.endsWith("/instruments")) return Response.json({ instruments: ["EURUSD"] });
      if (parsed.pathname.endsWith("/limits")) return Response.json({ limits: { rest: { methods: [{ http_method: "GET", path: "/v1/market-data/accounts/{account_id}/candles", limits: { max_candles_per_request: 1000, history_age_days: 365 } }] } } });
      if (parsed.pathname.endsWith("/candles")) {
        candleRequested = true;
        assert.equal(parsed.searchParams.get("count"), "1000");
        return Response.json({ candles: [] });
      }
      throw new Error("Unexpected upstream path");
    }
  });
  const candles = await adapter.getCandles(CONTEXT, {
    instrument: "EURUSD", timeframe: "M5", from: "2026-10-31T00:00:00.000Z", count: 1000
  });
  assert.deepEqual(candles, []);
  assert.equal(candleRequested, true);
});



test("oversized upstream body is cancelled before buffering when Content-Length is absent", async () => {
  let cancelled = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(40 * 1024));
        controller.enqueue(new Uint8Array(30 * 1024));
      },
      cancel() {
        cancelled = true;
      }
    }), { status: 200 })
  });

  await assert.rejects(adapter.getAccount(CONTEXT), /exness_response_too_large/);
  assert.equal(cancelled, true);
});


test("declared oversized upstream response is cancelled before parsing", async () => {
  let cancelled = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
      },
      cancel() {
        cancelled = true;
      }
    }), { status: 200, headers: { "Content-Length": String(64 * 1024 + 1) } })
  });

  await assert.rejects(adapter.getAccount(CONTEXT), /exness_response_too_large/);
  assert.equal(cancelled, true);
});


test("tick stream uses a signed GET handshake and sends only the read-only ticks subscription", async () => {
  const requests = [];
  const sent = [];
  let accepted = false;
  const socket = {
    accept() { accepted = true; },
    send(value) { sent.push(JSON.parse(value)); },
    close() { throw new Error("socket should remain open"); }
  };
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      requests.push({ parsed, init });
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname === "/v1/configuration/accounts/123456/instruments") {
        return Response.json({ instruments: ["EURUSD", "XAUUSD"] });
      }
      if (parsed.pathname === "/v1/server-events/accounts/123456/ws/ticks") {
        assert.equal(init.method, "GET");
        assert.equal(init.headers.Upgrade, "websocket");
        const payload = JSON.parse(Buffer.from(init.headers["EXN-DATA"], "base64url").toString("utf8"));
        assert.equal(payload.method, "GET");
        assert.equal(payload.path, "/v1/server-events/accounts/123456/ws/ticks");
        return { status: 101, webSocket: socket };
      }
      throw new Error("Unexpected upstream path");
    }
  });

  const result = await adapter.subscribeTicks(CONTEXT, {
    subscriptionId: "ticks-xauusd-1",
    instruments: ["XAUUSD"]
  });
  assert.equal(result, socket);
  assert.equal(accepted, true);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].parsed.origin, "https://ap-test.exness.com");
  assert.deepEqual(sent, [{
    id: "ticks-xauusd-1",
    subscribe: { event: "ticks", instruments: ["XAUUSD"] }
  }]);
  assert.deepEqual(EXNESS_READ_ONLY_FLAGS, {
    ordersEnabled: false,
    executionEnabled: false,
    order_submission_enabled: false,
    liveTradingEnabled: false
  });
});

test("tick stream rejects invalid or unavailable instruments before opening a socket", async () => {
  let websocketRequested = false;
  const adapter = createExnessReadOnlyAdapter({
    resolveCredentials: async () => CREDENTIALS,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: "123456", access_point: "ap-test.exness.com" });
      }
      if (parsed.pathname.endsWith("/instruments")) {
        return Response.json({ instruments: ["EURUSD"] });
      }
      websocketRequested = true;
      return { status: 101, webSocket: { send() {}, accept() {} } };
    }
  });

  await assert.rejects(adapter.subscribeTicks(CONTEXT, {
    subscriptionId: "ticks-xauusd-1", instruments: ["XAUUSD"]
  }), /exness_instrument_not_available/);
  await assert.rejects(adapter.subscribeTicks(CONTEXT, {
    subscriptionId: "ticks-invalid", instruments: ["EUR/USD"]
  }), /exness_tick_subscription_invalid/);
  assert.equal(websocketRequested, false);
});
