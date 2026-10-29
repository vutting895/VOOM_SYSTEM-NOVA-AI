export const INTENT_SCHEMA_VERSION = "nova.intent.v1";

export const INTENTS = Object.freeze([
  "blocked_action",
  "draft_strategy",
  "review_risk",
  "review_backtest",
  "explain_indicators",
  "general_research",
]);

export const UI_COMPONENTS = Object.freeze([
  "safety_notice",
  "strategy_draft",
  "risk_checklist",
  "backtest_review",
  "indicator_guide",
  "analysis_summary",
]);

const MARKETS = new Set(["BTC/USDT", "ETH/USDT", "EUR/USD", "XAU/USD", "US30"]);
const TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d"]);
const RISKS = new Set(["low", "medium", "high"]);

const COMPONENT_FOR_INTENT = Object.freeze({
  blocked_action: "safety_notice",
  draft_strategy: "strategy_draft",
  review_risk: "risk_checklist",
  review_backtest: "backtest_review",
  explain_indicators: "indicator_guide",
  general_research: "analysis_summary",
});

const BLOCKED_ACTION_PHRASES = [
  "place_trade_order", "place order", "execute trade", "trade now", "buy now", "sell now",
  "open trade", "close trade", "modify order", "send order",
  "เปิดออเดอร์", "ปิดออเดอร์", "ส่งคำสั่งซื้อ", "ส่งคำสั่งขาย", "ส่งคำสั่งเทรด",
  "ซื้อเลย", "ขายเลย", "เทรดเลย", "เปิดสถานะ", "ปิดสถานะ", "แก้ไขออเดอร์",
];

const DRAFT_PHRASES = [
  "draft strategy", "create strategy", "design strategy", "strategy draft",
  "ร่างกลยุทธ์", "สร้างกลยุทธ์", "ออกแบบกลยุทธ์", "ช่วยวางกลยุทธ์", "สร้างแผนกลยุทธ์",
];

function containsAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function normalizeMarket(text) {
  const compact = text.toUpperCase().replace(/[\s_-]/g, "");
  if (compact.includes("BTC/USDT") || compact.includes("BTCUSDT") || compact.includes("BITCOIN")) return "BTC/USDT";
  if (compact.includes("ETH/USDT") || compact.includes("ETHUSDT") || compact.includes("ETHEREUM")) return "ETH/USDT";
  if (compact.includes("EUR/USD") || compact.includes("EURUSD")) return "EUR/USD";
  if (compact.includes("XAU/USD") || compact.includes("XAUUSD") || text.includes("ทองคำ") || /\bgold\b/i.test(text)) return "XAU/USD";
  if (compact.includes("US30") || compact.includes("DOW JONES")) return "US30";
  return null;
}

function normalizeTimeframe(text) {
  const lower = text.toLowerCase();
  if (/(?:\b5m\b|\bm5\b|5 นาที|5นาที)/i.test(text)) return "5m";
  if (/(?:\b15m\b|\bm15\b|15 นาที|15นาที)/i.test(text)) return "15m";
  if (/(?:\b1h\b|\bh1\b|1 ชั่วโมง|1ชั่วโมง)/i.test(text)) return "1h";
  if (/(?:\b4h\b|\bh4\b|4 ชั่วโมง|4ชั่วโมง)/i.test(text)) return "4h";
  if (/(?:\b1d\b|\bd1\b|รายวัน|daily)/i.test(lower)) return "1d";
  return null;
}

function normalizeRisk(text) {
  const lower = text.toLowerCase();
  if (lower.includes("low risk") || lower.includes("risk low") || lower.includes("ความเสี่ยงต่ำ") || lower.includes("เสี่ยงต่ำ")) return "low";
  if (lower.includes("high risk") || lower.includes("risk high") || lower.includes("ความเสี่ยงสูง") || lower.includes("เสี่ยงสูง")) return "high";
  if (lower.includes("medium risk") || lower.includes("risk medium") || lower.includes("ความเสี่ยงปานกลาง") || lower.includes("เสี่ยงปานกลาง")) return "medium";
  return null;
}

/**
 * Safe first-pass intent routing. This is deliberately deterministic and only selects
 * research-oriented cards. It never calls an execution tool and never trusts model-generated
 * component names or HTML. Ambiguous prompts fall back to general_research.
 */
export function classifyResearchIntent(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 1200) {
    throw new TypeError("intent_input_invalid");
  }
  const text = input.trim();
  const lower = text.toLowerCase();
  let intent = "general_research";

  if (containsAny(lower, BLOCKED_ACTION_PHRASES)) {
    intent = "blocked_action";
  } else if (
    containsAny(lower, ["risk", "drawdown", "margin", "position sizing", "stop loss", "ความเสี่ยง", "มาร์จิน", "ขนาดสัญญา", "จุดตัดขาดทุน"])
  ) {
    intent = "review_risk";
  } else if (
    containsAny(lower, ["backtest", "back test", "historical test", "ทดสอบย้อนหลัง", "ผลทดสอบย้อนหลัง"])
  ) {
    intent = "review_backtest";
  } else if (containsAny(lower, DRAFT_PHRASES)) {
    intent = "draft_strategy";
  } else if (
    containsAny(lower, ["ema", "rsi", "indicator", "อินดิเคเตอร์", "ค่าเฉลี่ยเคลื่อนที่", "ดัชนีแรงซื้อ"])
  ) {
    intent = "explain_indicators";
  }

  const parameters = {
    market: normalizeMarket(text),
    timeframe: normalizeTimeframe(text),
    risk: normalizeRisk(text),
  };
  const component = {
    type: COMPONENT_FOR_INTENT[intent],
    market: parameters.market,
    timeframe: parameters.timeframe,
    risk: parameters.risk,
    executionEnabled: false,
    liveTradingEnabled: false,
  };
  return {
    schemaVersion: INTENT_SCHEMA_VERSION,
    intent,
    parameters,
    component,
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nullableMember(value, allowed) {
  return value === null || (typeof value === "string" && allowed.has(value));
}

/**
 * Strictly validate and copy an intent envelope at the API boundary. Reject unknown keys,
 * arbitrary component names, user/model supplied content, and any attempt to turn on execution.
 */
export function validateIntentEnvelope(value) {
  const rootKeys = ["schemaVersion", "intent", "parameters", "component"];
  const parameterKeys = ["market", "timeframe", "risk"];
  const componentKeys = ["type", "market", "timeframe", "risk", "executionEnabled", "liveTradingEnabled"];

  if (!hasExactKeys(value, rootKeys) || value.schemaVersion !== INTENT_SCHEMA_VERSION || !INTENTS.includes(value.intent)) {
    return { ok: false, error: "invalid_intent_envelope" };
  }
  if (!hasExactKeys(value.parameters, parameterKeys)) {
    return { ok: false, error: "invalid_intent_parameters" };
  }
  const { market, timeframe, risk } = value.parameters;
  if (!nullableMember(market, MARKETS) || !nullableMember(timeframe, TIMEFRAMES) || !nullableMember(risk, RISKS)) {
    return { ok: false, error: "invalid_intent_parameters" };
  }

  const component = value.component;
  if (
    !hasExactKeys(component, componentKeys) ||
    !UI_COMPONENTS.includes(component.type) ||
    component.type !== COMPONENT_FOR_INTENT[value.intent] ||
    component.market !== market ||
    component.timeframe !== timeframe ||
    component.risk !== risk ||
    component.executionEnabled !== false ||
    component.liveTradingEnabled !== false
  ) {
    return { ok: false, error: "invalid_intent_component" };
  }

  // Return a new, normalized data-only object so callers never render the original object.
  return {
    ok: true,
    value: {
      schemaVersion: INTENT_SCHEMA_VERSION,
      intent: value.intent,
      parameters: { market, timeframe, risk },
      component: {
        type: component.type,
        market,
        timeframe,
        risk,
        executionEnabled: false,
        liveTradingEnabled: false,
      },
    },
  };
}
