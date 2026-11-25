import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMt5DatasetPayload, buildStableMt5IngestionId, callDatacenterTool, datacenterTools } from "../src/datacenter-client.js";

test("Learning tools are exposed by the existing NOVA Remote MCP catalog", () => {
  const names = new Set(datacenterTools.map((tool) => tool.name));
  for (const name of [
    "dataset_ingest", "dataset_approve", "universe_register", "analysis_run",
    "learning_submit", "learning_status", "model_list", "model_approve", "audit_log_list",
    "backtest_run", "walk_forward_replay", "research_run_get", "research_run_list",
  ]) assert.ok(names.has(name), name);
});

test("Datacenter calls forward the authenticated Supabase session and use stateless MCP", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({url: String(url), init});
    const body = JSON.parse(init.body);
    if (body.method === "notifications/initialized") return new Response(null, {status: 202});
    const result = body.method === "tools/call"
      ? {content: [{type: "text", text: JSON.stringify({status: "PASSED", ownerScoped: true})}], isError: false}
      : {};
    return new Response(JSON.stringify({jsonrpc: "2.0", id: body.id ?? null, result}), {
      status: 200, headers: {"content-type": "application/json"},
    });
  };
  try {
    const request = new Request("https://gateway.example/mcp", {
      headers: {Authorization: "Bearer supabase-user-session"},
    });
    const result = await callDatacenterTool(
      "dataset_list", {limit: 20}, request,
      {DATACENTER_MCP_URL: "https://learning.example/mcp"},
    );
    assert.deepEqual(result, {status: "PASSED", ownerScoped: true});
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.url === "https://learning.example/mcp"));
    assert.ok(calls.every((call) => call.init.headers.Authorization === "Bearer supabase-user-session"));
    assert.equal(JSON.parse(calls[2].init.body).params.name, "dataset_list");
    assert.equal("user_id" in JSON.parse(calls[2].init.body).params.arguments, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Datacenter client fails closed when endpoint or user session is missing", async () => {
  const request = new Request("https://gateway.example/mcp");
  await assert.rejects(
    callDatacenterTool("dataset_list", {}, request, {}),
    /authentication_required/,
  );
  const authenticated = new Request("https://gateway.example/mcp", {
    headers: {Authorization: "Bearer valid-session"},
  });
  await assert.rejects(
    callDatacenterTool("dataset_list", {}, authenticated, {}),
    /datacenter_service_not_configured/,
  );
  await assert.rejects(
    callDatacenterTool("unknown_tool", {}, authenticated, {DATACENTER_MCP_URL:"https://learning.example/mcp"}),
    /unknown_datacenter_tool/,
  );
});

test("Datacenter URL must be HTTPS and end at the fixed MCP path", async () => {
  const request = new Request("https://gateway.example/mcp", {
    headers: {Authorization: "Bearer valid-session"},
  });
  await assert.rejects(
    callDatacenterTool("dataset_list", {}, request, {DATACENTER_MCP_URL:"http://learning.example/mcp"}),
    /datacenter_service_configuration_invalid/,
  );
});

test("MT5 symbol validation preserves mixed-case broker suffixes", () => {
  const bars = [
    {time:"2026-01-01T00:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0},
    {time:"2026-01-01T01:00:00Z",open:11,high:13,low:10,close:12,tick_volume:6,spread:2,real_volume:0},
  ];
  const payload = buildMt5DatasetPayload({
    symbol:"XAUUSDm", timeframe:"H1", bars,
    now_ms:Date.parse("2026-01-02T00:00:00Z"),
  });
  assert.deepEqual(payload.manifest.symbols, ["XAUUSDm"]);
  assert.throws(() => buildMt5DatasetPayload({
    symbol:"XAUUSDm/../other", timeframe:"H1", bars,
    now_ms:Date.parse("2026-01-02T00:00:00Z"),
  }), /invalid_mt5_dataset_symbol/);
});


test("MT5 ingestion adapter excludes the forming candle and preserves source order", () => {
  const bars = [
    {time:"2026-01-01T00:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0},
    {time:"2026-01-01T01:00:00Z",open:11,high:13,low:10,close:12,tick_volume:6,spread:2,real_volume:0},
    {time:"2026-01-01T02:00:00Z",open:12,high:14,low:11,close:13,tick_volume:7,spread:3,real_volume:0},
    {time:"2026-01-01T03:00:00Z",open:13,high:15,low:12,close:14,tick_volume:8,spread:3,real_volume:0},
  ];
  const payload = buildMt5DatasetPayload({
    symbol:"XAUUSDm", timeframe:"H1", bars,
    now_ms:Date.parse("2026-01-01T03:30:00Z"),
  });
  assert.equal(payload.rows.length, 3);
  assert.equal(payload.manifest.expected_interval_seconds, 3600);
  assert.equal(payload.manifest.coverage_start, "2026-01-01T00:00:00.000Z");
  assert.equal(payload.manifest.coverage_end, "2026-01-01T02:00:00.000Z");
  assert.equal(payload.rows[0].volume, 5);
  assert.equal(payload.manifest.source, "exness-mt5-demo-readonly");
  assert.equal(payload.manifest.symbols[0], "XAUUSDm");
});

test("MT5 ingestion adapter rejects reversed source bars instead of silently sorting", () => {
  const bars = [
    {time:"2026-01-01T01:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0},
    {time:"2026-01-01T00:00:00Z",open:11,high:13,low:10,close:12,tick_volume:6,spread:2,real_volume:0},
  ];
  assert.throws(() => buildMt5DatasetPayload({
    symbol:"XAUUSDm", timeframe:"H1", bars,
    now_ms:Date.parse("2026-01-02T00:00:00Z"),
  }), /must_be_valid_and_ascending/);
});


test("MT5 stable ingestion identity is deterministic and changes with payload", async () => {
  const bars = [
    {time:"2026-01-01T00:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0},
    {time:"2026-01-01T01:00:00Z",open:11,high:13,low:10,close:12,tick_volume:6,spread:2,real_volume:0},
  ];
  const payload = buildMt5DatasetPayload({symbol:"XAUUSDm",timeframe:"H1",bars,now_ms:Date.parse("2026-01-02T00:00:00Z")});
  const first = await buildStableMt5IngestionId(payload);
  const second = await buildStableMt5IngestionId(payload);
  assert.equal(first, second);
  assert.match(first, /^mt5-[a-f0-9]{64}$/);
  const changed = {...payload,rows:payload.rows.map((row,index)=>index===0?{...row,close:10.5}:row)};
  assert.notEqual(await buildStableMt5IngestionId(changed), first);
});

test("MT5 dataset builder rejects malformed OHLC and negative volume", () => {
  const base = {time:"2026-01-01T00:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0};
  assert.throws(() => buildMt5DatasetPayload({symbol:"XAUUSDm",timeframe:"H1",bars:[base,{...base,time:"2026-01-01T01:00:00Z",low:12}],now_ms:Date.parse("2026-01-02T00:00:00Z")}), /invalid_ohlc/);
  assert.throws(() => buildMt5DatasetPayload({symbol:"XAUUSDm",timeframe:"H1",bars:[base,{...base,time:"2026-01-01T01:00:00Z",tick_volume:-1}],now_ms:Date.parse("2026-01-02T00:00:00Z")}), /invalid_volume_or_spread/);
});


test("MT5 stable ingestion identity canonicalizes object key order", async () => {
  const bars = [
    {time:"2026-01-01T00:00:00Z",open:10,high:12,low:9,close:11,tick_volume:5,spread:2,real_volume:0},
    {time:"2026-01-01T01:00:00Z",open:11,high:13,low:10,close:12,tick_volume:6,spread:2,real_volume:0},
  ];
  const a = buildMt5DatasetPayload({symbol:"XAUUSDm",timeframe:"H1",bars,market_calendar:{closed_intervals:[{start:"2026-01-01T00:00:00Z",end:"2026-01-01T01:00:00Z"}]},now_ms:Date.parse("2026-01-02T00:00:00Z")});
  const b = buildMt5DatasetPayload({symbol:"XAUUSDm",timeframe:"H1",bars,market_calendar:{closed_intervals:[{end:"2026-01-01T01:00:00Z",start:"2026-01-01T00:00:00Z"}]},now_ms:Date.parse("2026-01-02T00:00:00Z")});
  assert.equal(await buildStableMt5IngestionId(a), await buildStableMt5IngestionId(b));
});
