import test from "node:test";
import assert from "node:assert/strict";
import hub from "../worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_TOKEN = "synthetic-user-session-token";
const INTERNAL_TOKEN = "x".repeat(48);
const ORIGIN = "https://voomsystem.netlify.app";

function makeBars(count = 26) {
  const start = Date.parse("2026-11-07T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const close = 1.1 + index * 0.0001;
    return {
      time: new Date(start + index * 300000).toISOString(),
      open: close,
      high: close + 0.0002,
      low: close - 0.0002,
      close,
      tick_volume: 100 + index,
      real_volume: 0,
      spread: 2
    };
  });
}

function setupFetch({ bars = makeBars(), dispatchStatus = 202 } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.hostname === "supabase.example" && url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + SESSION_TOKEN);
      return Response.json({ id: USER_ID });
    }
    if (url.hostname === "supabase.example" && url.pathname === "/rest/v1/broker_connections") {
      assert.equal(url.searchParams.get("user_id"), "eq." + USER_ID);
      assert.equal(url.searchParams.get("id"), "eq." + CONNECTION_ID);
      return Response.json([{
        id: CONNECTION_ID,
        user_id: USER_ID,
        provider: "exness_mt5",
        environment: "demo",
        status: "connected",
        bridge_route_id: "route-a"
      }]);
    }
    if (url.hostname === "proxy.workers.dev" && url.pathname === "/api/quotes") {
      assert.equal(init.headers.Authorization, "Bearer " + SESSION_TOKEN);
      assert.equal(url.searchParams.get("count"), "26");
      return Response.json({
        symbol: "EURUSD",
        timeframe: "M5",
        bars,
        count: bars.length,
        as_of: "2026-11-07T02:11:00.000Z"
      });
    }
    if (url.hostname === "analysis.example" && url.pathname === "/internal/v1/analysis/smc") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Bearer " + INTERNAL_TOKEN);
      assert.notEqual(init.headers.Authorization, "Bearer " + SESSION_TOKEN);
      const payload = JSON.parse(init.body);
      assert.equal(payload.tenant_id, USER_ID);
      assert.equal(payload.connection_id, CONNECTION_ID);
      assert.equal(payload.symbol, "EURUSD");
      assert.equal(payload.timeframe, "5m");
      assert.equal(payload.last_bar_closed, true);
      assert.equal(payload.bars.length, 25);
      assert.equal(payload.bars.at(-1).timestamp, bars.at(-2).time);
      assert.equal(payload.bars.some((bar) => bar.timestamp === bars.at(-1).time), false);
      assert.equal(payload.source_metadata.provider, "exness_mt5_demo");
      return Response.json({ task_id: "task-123", status: "QUEUED" }, { status: dispatchStatus });
    }
    throw new Error("Unexpected fetch target: " + url.origin + url.pathname);
  };
  return {
    calls,
    restore() { globalThis.fetch = originalFetch; }
  };
}

function request(body) {
  return new Request("https://hub.example/v1/connections/" + CONNECTION_ID + "/analyze", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + SESSION_TOKEN,
      Origin: ORIGIN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

const env = {
  SUPABASE_URL: "https://supabase.example",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  MT5_READONLY_PROXY_URL: "https://proxy.workers.dev",
  NOVA_ANALYSIS_DISPATCH_URL: "https://analysis.example/internal/v1/analysis/smc",
  NOVA_ANALYSIS_DISPATCH_HOST: "analysis.example",
  NOVA_ANALYSIS_DISPATCH_TOKEN: INTERNAL_TOKEN,
  ALLOWED_ORIGINS: ORIGIN
};

test("authenticated owner analysis dispatches only closed MT5 candles to the private task API", async () => {
  const mock = setupFetch();
  try {
    const response = await hub.fetch(request({ symbol: "EURUSD", timeframe: "M5", count: 25 }), env);
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.taskId, "task-123");
    assert.equal(body.status, "QUEUED");
    assert.equal(body.analyzedBarCount, 25);
    assert.equal(body.dataVerified, true);
    assert.equal(body.ordersEnabled, false);
    assert.equal(body.executionEnabled, false);
    assert.equal(body.liveTradingEnabled, false);
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("analysis dispatch fails closed when the private endpoint is not configured", async () => {
  const mock = setupFetch();
  try {
    const incomplete = { ...env, NOVA_ANALYSIS_DISPATCH_TOKEN: "" };
    const response = await hub.fetch(request({ symbol: "EURUSD", timeframe: "M5", count: 25 }), incomplete);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "analysis_dispatch_not_configured");
    assert.equal(mock.calls.length, 2); // Auth + owner-scoped connection lookup only.
  } finally {
    mock.restore();
  }
});

test("analysis dispatch rejects invalid count before requesting market data", async () => {
  const mock = setupFetch();
  try {
    const response = await hub.fetch(request({ symbol: "EURUSD", timeframe: "M5", count: 10 }), env);
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error, "analysis_count_must_be_between_25_and_499");
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test("analysis dispatch rejects malformed or out-of-order provider candles", async () => {
  const badBars = makeBars();
  badBars[8].time = badBars[7].time;
  const mock = setupFetch({ bars: badBars });
  try {
    const response = await hub.fetch(request({ symbol: "EURUSD", timeframe: "M5", count: 25 }), env);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "mt5_bar_time_invalid");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});
