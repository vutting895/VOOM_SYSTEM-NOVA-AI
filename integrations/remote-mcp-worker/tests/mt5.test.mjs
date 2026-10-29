import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMt5Count, normalizeMt5Symbol, normalizeMt5Timeframe, tools } from "../src/index.js";

const names = new Set(tools.map((tool) => tool.name));

test("MT5 MCP exposes only read-only Exness Demo account tools", () => {
  for (const name of [
    "mt5_connection_status",
    "request_mt5_demo_connection",
    "mt5_account_summary",
    "mt5_symbols",
    "mt5_quotes"
  ]) assert.ok(names.has(name), "missing MCP tool: " + name);

  assert.equal(tools.length, 13);
  assert.equal([...names].some((name) => /^(place|submit|close|modify|execute)_?(order|trade)/i.test(name)), false);
  for (const name of ["mt5_connection_status", "mt5_account_summary", "mt5_symbols", "mt5_quotes"]) {
    assert.match(tools.find((tool) => tool.name === name).description, /read-only/i);
  }
  assert.match(tools.find((tool) => tool.name === "request_mt5_demo_connection").description, /pending/i);
});

test("MT5 quote symbol input is restricted to safe broker-symbol characters", () => {
  assert.equal(normalizeMt5Symbol("XAUUSDm"), "XAUUSDm");
  assert.equal(normalizeMt5Symbol("EURUSD.a"), "EURUSD.a");
  assert.throws(() => normalizeMt5Symbol("XAUUSD?connection_id=anything"));
  assert.throws(() => normalizeMt5Symbol(""));
});

test("MT5 timeframe only allows bridge-supported values", () => {
  assert.equal(normalizeMt5Timeframe("m15"), "M15");
  assert.equal(normalizeMt5Timeframe("D1"), "D1");
  assert.throws(() => normalizeMt5Timeframe("W1"));
  assert.throws(() => normalizeMt5Timeframe("tick"));
});

test("MT5 count is a bounded integer and rejects unexpected values", () => {
  assert.equal(normalizeMt5Count(undefined), 100);
  assert.equal(normalizeMt5Count(500), 500);
  assert.throws(() => normalizeMt5Count(501));
  assert.throws(() => normalizeMt5Count(0));
  assert.throws(() => normalizeMt5Count("2.5"));
});

test("the authenticated MCP registry must never expose broker-write tools", () => {
  const forbiddenToolName = /(?:place|submit|execute|send|modify|amend|cancel|close|transfer|withdraw).*?(?:order|trade|position|fund)/i;
  assert.equal(names.has("execute_broker_order"), false);
  assert.equal(
    [...names].some((name) => forbiddenToolName.test(name)),
    false,
    "MCP registry must not expose order, position or fund mutation tools"
  );
  for (const tool of tools) {
    assert.notEqual(tool.annotations?.readOnlyHint, false, "write-capable tool must not be registered: " + tool.name);
  }
});
