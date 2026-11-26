const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITIES = new Set([
  "mt5.account.read",
  "mt5.quotes.read",
  "broker.order.submit"
]);
const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const SYMBOL = /^[A-Za-z0-9._-]{1,40}$/;

export class BrainIntentError extends Error {
  constructor(code) {
    super(code);
    this.name = "BrainIntentError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function parseBrainIntent(value) {
  if (!isRecord(value) || !hasExactKeys(value, ["schema_version", "intent_id", "capability", "connection_id", "parameters"])) {
    throw new BrainIntentError("invalid_intent_schema");
  }
  if (value.schema_version !== "1.0") throw new BrainIntentError("unsupported_schema_version");
  if (typeof value.intent_id !== "string" || !UUID.test(value.intent_id)) throw new BrainIntentError("invalid_intent_id");
  if (typeof value.connection_id !== "string" || !UUID.test(value.connection_id)) throw new BrainIntentError("invalid_connection_id");
  if (typeof value.capability !== "string" || !CAPABILITIES.has(value.capability)) throw new BrainIntentError("capability_not_allowlisted");
  if (!isRecord(value.parameters)) throw new BrainIntentError("invalid_parameters");

  if (value.capability === "mt5.account.read" || value.capability === "broker.order.submit") {
    if (Object.keys(value.parameters).length !== 0) throw new BrainIntentError("unexpected_parameters");
  } else if (value.capability === "mt5.quotes.read") {
    if (!hasExactKeys(value.parameters, ["symbol", "timeframe", "count"])) throw new BrainIntentError("invalid_quote_parameters");
    if (typeof value.parameters.symbol !== "string" || !SYMBOL.test(value.parameters.symbol)) throw new BrainIntentError("invalid_symbol");
    if (typeof value.parameters.timeframe !== "string" || !TIMEFRAMES.has(value.parameters.timeframe)) throw new BrainIntentError("invalid_timeframe");
    if (!Number.isInteger(value.parameters.count) || value.parameters.count < 1 || value.parameters.count > 500) throw new BrainIntentError("invalid_count");
  }

  return Object.freeze({
    schemaVersion: value.schema_version,
    intentId: value.intent_id,
    capability: value.capability,
    connectionId: value.connection_id,
    parameters: Object.freeze({ ...value.parameters })
  });
}

export function buildBrainPlan(intent) {
  if (!intent || !CAPABILITIES.has(intent.capability)) throw new BrainIntentError("capability_not_allowlisted");
  if (intent.capability === "broker.order.submit") {
    return Object.freeze({ intentId: intent.intentId, capability: intent.capability, target: "execution-gate", mutating: true, dispatchAllowed: false });
  }
  return Object.freeze({
    intentId: intent.intentId,
    capability: intent.capability,
    target: "existing-system-hub-mt5-readonly-handler",
    mutating: false,
    dispatchAllowed: true
  });
}
