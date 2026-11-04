import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const env = read("../.env.example");
const server = read("../server.ts");
const settings = read("../src/components/SystemSettingsView.tsx");

test("live trading defaults are fail-closed in environment and UI", () => {
  assert.match(env, /^VOOM_LIVE_TRADING_ENABLED=false$/m);
  assert.match(server, /let liveTradingEnabled = false/);
  assert.match(settings, /useState<boolean>\(false\)/);
  assert.doesNotMatch(settings, /EXN-ED25519-[A-Z0-9]+/);
  assert.doesNotMatch(settings, /setExnessAccountId, useState<string>\('23908764'\)/);
});

test("server blocks order, approval, broker credential and live-mode mutations before routes", () => {
  const guardAt = server.indexOf("const blockedTradingMutationPaths");
  assert.notEqual(guardAt, -1);
  for (const route of [
    "app.post('/api/orders/execute'",
    "app.post('/api/intent/dispatch'",
    "app.post('/api/intent/interrupt/resolve'",
    "app.post('/api/live-trading/toggle'",
    "app.post('/api/broker/status'",
    "app.post('/api/mt5-bridge/toggle'",
  ]) {
    const routeAt = server.indexOf(route);
    assert.notEqual(routeAt, -1, route);
    assert.ok(guardAt < routeAt, route);
  }
  assert.match(server, /trading_execution_disabled/);
  assert.match(server, /broker_identity_unverified/);
  assert.doesNotMatch(server, /brokerDirectSlTpWorker: true/);
  assert.doesNotMatch(server, /name: 'place_trade_order'/);
});

test("unsafe prototype MT5 bridge with unauthenticated real-order routes is retired", () => {
  assert.equal(existsSync(new URL("../backend/mt5_bridge.py", import.meta.url)), false);
});
