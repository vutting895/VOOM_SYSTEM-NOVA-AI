import test from "node:test";
import assert from "node:assert/strict";
import { parseBrainIntent, buildBrainPlan, BrainIntentError } from "../brain-core.js";
import { authorizeCapability, TRADING_SAFETY_FLAGS } from "../permission-engine.js";

const USER = { userId: "user-a" };
const CONNECTION = {
  id: "00000000-0000-4000-8000-000000000000",
  user_id: "user-a",
  provider: "exness_mt5",
  environment: "demo",
  status: "connected",
  bridge_route_id: "tenant-route-a"
};
const baseIntent = {
  schema_version: "1.0",
  intent_id: "11111111-1111-4111-8111-111111111111",
  capability: "mt5.account.read",
  connection_id: CONNECTION.id,
  parameters: {}
};

test("Brain Core accepts a strictly typed read-only account intent", () => {
  const intent = parseBrainIntent(baseIntent);
  assert.equal(intent.capability, "mt5.account.read");
  assert.equal(buildBrainPlan(intent).dispatchAllowed, true);
  assert.equal(buildBrainPlan(intent).mutating, false);
});

test("Brain Core validates bounded quote parameters", () => {
  const intent = parseBrainIntent({
    ...baseIntent,
    capability: "mt5.quotes.read",
    parameters: { symbol: "XAUUSDm", timeframe: "M5", count: 100 }
  });
  assert.equal(intent.parameters.count, 100);
});

test("Brain Core rejects forged permission and tenant fields", () => {
  assert.throws(() => parseBrainIntent({ ...baseIntent, ordersEnabled: true }), BrainIntentError);
  assert.throws(() => parseBrainIntent({ ...baseIntent, tenant_id: "tenant-b" }), BrainIntentError);
});

test("Brain Core rejects unknown capabilities and malformed quote bounds", () => {
  assert.throws(() => parseBrainIntent({ ...baseIntent, capability: "arbitrary.python" }), /capability_not_allowlisted/);
  assert.throws(() => parseBrainIntent({ ...baseIntent, capability: "mt5.quotes.read", parameters: { symbol: "XAUUSDm", timeframe: "M5", count: 501 } }), /invalid_count/);
});

test("Permission Engine allows only authenticated owner-scoped connected Demo reads", () => {
  const result = authorizeCapability({ principal: USER, connection: CONNECTION, capability: "mt5.account.read" });
  assert.equal(result.allowed, true);
  assert.deepEqual(TRADING_SAFETY_FLAGS, { ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false });
});

test("Permission Engine denies foreign tenant and non-Demo connections", () => {
  assert.equal(authorizeCapability({ principal: USER, connection: { ...CONNECTION, user_id: "user-b" }, capability: "mt5.account.read" }).reason, "connection_not_owned");
  assert.equal(authorizeCapability({ principal: USER, connection: { ...CONNECTION, environment: "live" }, capability: "mt5.account.read" }).reason, "environment_not_allowed");
});

test("Permission Engine denies disconnected and unallowlisted capabilities", () => {
  assert.equal(authorizeCapability({ principal: USER, connection: { ...CONNECTION, status: "pending" }, capability: "mt5.account.read" }).reason, "connection_not_ready");
  assert.equal(authorizeCapability({ principal: USER, connection: CONNECTION, capability: "arbitrary.tool" }).reason, "capability_not_allowlisted");
});

test("Permission Engine denies all broker mutations regardless of caller flags", () => {
  for (const capability of ["broker.order.submit", "broker.order.modify", "broker.position.close", "account.funds.withdraw"]) {
    const result = authorizeCapability({ principal: USER, connection: CONNECTION, capability, ordersEnabled: true, executionEnabled: true, liveTradingEnabled: true });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "execution_disabled");
  }
});
