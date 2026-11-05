import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  INTENT_SCHEMA_VERSION,
  INTENTS,
  UI_COMPONENTS,
  classifyResearchIntent,
  validateIntentEnvelope,
} from "./intent-contract.js";

const sharedSchema = JSON.parse(await readFile(new URL("../../shared/nova-intent-envelope.schema.json", import.meta.url), "utf8"));

test("JSON Schema is aligned with the runtime intent/component allow-lists", () => {
  assert.equal(sharedSchema.properties.schemaVersion.const, INTENT_SCHEMA_VERSION);
  assert.deepEqual(sharedSchema.properties.intent.enum, INTENTS);
  assert.deepEqual(sharedSchema.properties.component.properties.type.enum, UI_COMPONENTS);
  assert.equal(sharedSchema.properties.component.properties.executionEnabled.const, false);
  assert.equal(sharedSchema.properties.component.properties.liveTradingEnabled.const, false);
  assert.equal(sharedSchema.additionalProperties, false);
});

test("classifies a strategy request into a fixed draft card with only allow-listed parameters", () => {
  const result = classifyResearchIntent("ร่างกลยุทธ์ EMA 12/26 สำหรับ XAUUSDm M15 ความเสี่ยงต่ำ");
  assert.equal(result.schemaVersion, INTENT_SCHEMA_VERSION);
  assert.equal(result.intent, "draft_strategy");
  assert.equal(result.parameters.market, "XAU/USD");
  assert.equal(result.parameters.timeframe, "15m");
  assert.equal(result.parameters.risk, "low");
  assert.equal(result.component.type, "strategy_draft");
  assert.equal(result.component.executionEnabled, false);
  assert.equal(result.component.liveTradingEnabled, false);
  assert.deepEqual(Object.keys(result).sort(), ["component", "intent", "parameters", "schemaVersion"]);
  assert.deepEqual(Object.keys(result.parameters).sort(), ["market", "risk", "timeframe"]);
});

test("routes an order-submission request to the static safety card and never an execution tool", () => {
  const result = classifyResearchIntent("Please place order to buy XAU now");
  assert.equal(result.intent, "blocked_action");
  assert.equal(result.component.type, "safety_notice");
  assert.equal(result.component.executionEnabled, false);
  assert.equal(result.component.liveTradingEnabled, false);
  assert.ok(!INTENTS.includes("place_trade_order"));
});

test("routes risk and backtest requests to their dedicated static cards", () => {
  assert.equal(classifyResearchIntent("ตรวจความเสี่ยง drawdown และ margin usage").component.type, "risk_checklist");
  assert.equal(classifyResearchIntent("ช่วยอธิบายผล backtest และ slippage").intent, "review_backtest");
  assert.equal(classifyResearchIntent("Review backtest limits and historical data").component.type, "backtest_review");
});

test("indicator questions stay in research mode", () => {
  const result = classifyResearchIntent("อธิบาย EMA 12/26 และ RSI 14");
  assert.equal(result.intent, "explain_indicators");
  assert.equal(result.component.type, "indicator_guide");
});

test("unknown market/timeframe/risk are not guessed", () => {
  const result = classifyResearchIntent("ร่างกลยุทธ์สำหรับตลาดแปลกใหม่บนกรอบเวลา W7 ความเสี่ยงปานกลาง");
  assert.equal(result.parameters.market, null);
  assert.equal(result.parameters.timeframe, null);
  assert.equal(result.parameters.risk, "medium");
});

test("rejects non-string, empty, and over-length intent inputs", () => {
  assert.throws(() => classifyResearchIntent(""), /intent_input_invalid/);
  assert.throws(() => classifyResearchIntent("x".repeat(1201)), /intent_input_invalid/);
  assert.throws(() => classifyResearchIntent({ prompt: "open" }), /intent_input_invalid/);
});

test("accepts an envelope produced by the classifier and returns a normalized copy", () => {
  const result = classifyResearchIntent("Draft strategy for EUR/USD at 1h, low risk");
  const checked = validateIntentEnvelope(result);
  assert.equal(checked.ok, true);
  assert.notEqual(checked.value, result);
  assert.deepEqual(checked.value, result);
});

test("rejects arbitrary component names, HTML, and unknown root keys", () => {
  const valid = classifyResearchIntent("Draft strategy for BTCUSDT");
  const arbitraryComponent = structuredClone(valid);
  arbitraryComponent.component.type = "script";
  arbitraryComponent.component.html = "<script>sendOrder()</script>";
  assert.equal(validateIntentEnvelope(arbitraryComponent).ok, false);

  const arbitraryRoot = { ...valid, componentCode: "javascript:execute()" };
  assert.equal(validateIntentEnvelope(arbitraryRoot).ok, false);
});

test("rejects added parameter fields and out-of-catalog values", () => {
  const valid = classifyResearchIntent("Draft strategy for BTCUSDT");
  const addedField = structuredClone(valid);
  addedField.parameters.accountId = "other-user";
  assert.equal(validateIntentEnvelope(addedField).ok, false);

  const badMarket = structuredClone(valid);
  badMarket.parameters.market = "foreign-tenant-account";
  badMarket.component.market = "foreign-tenant-account";
  assert.equal(validateIntentEnvelope(badMarket).ok, false);
});

test("rejects any attempt to enable execution or trading", () => {
  const valid = classifyResearchIntent("Draft strategy for BTCUSDT");
  const enabled = structuredClone(valid);
  enabled.component.executionEnabled = true;
  assert.equal(validateIntentEnvelope(enabled).ok, false);

  const live = structuredClone(valid);
  live.component.liveTradingEnabled = true;
  assert.equal(validateIntentEnvelope(live).ok, false);
});

test("rejects mismatched component and intent mappings", () => {
  const valid = classifyResearchIntent("Review risk for EURUSD");
  const mismatched = { ...valid, component: { ...valid.component, type: "strategy_draft" } };
  assert.equal(validateIntentEnvelope(mismatched).ok, false);
  assert.equal(UI_COMPONENTS.includes("trade_order_card"), false);
});
