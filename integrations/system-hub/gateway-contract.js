export const CONTRACT_VERSION = "1";
export const MAX_TOOL_BODY_BYTES = 16 * 1024;
export const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const string = (extra = {}) => ({ type: "string", ...extra });
const integer = (extra = {}) => ({ type: "integer", ...extra });
const object = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: false
});

export const CAPABILITIES = Object.freeze([
  {
    name: "list_integrations",
    description: "List NOVA integration adapter metadata and verification state.",
    handler: "integrations",
    scope: "integrations:read",
    readOnly: true,
    maxBodyBytes: 1024,
    inputSchema: object({})
  },
  {
    name: "list_connections",
    description: "List only the authenticated user's own broker connection records.",
    handler: "connections",
    scope: "connections:read",
    readOnly: true,
    maxBodyBytes: 1024,
    inputSchema: object({})
  },
  {
    name: "mt5_connection_status",
    description: "Read the authenticated user's own Exness MT5 Demo connection status.",
    handler: "mt5_status",
    scope: "mt5:read",
    readOnly: true,
    maxBodyBytes: 2048,
    inputSchema: object({ connection_id: string({ minLength: 36, maxLength: 36 }) }, ["connection_id"])
  },
  {
    name: "mt5_account_summary",
    description: "Read account summary from the user's own connected Exness MT5 Demo terminal.",
    handler: "mt5_account",
    scope: "mt5:read",
    readOnly: true,
    maxBodyBytes: 2048,
    inputSchema: object({ connection_id: string({ minLength: 36, maxLength: 36 }) }, ["connection_id"])
  },
  {
    name: "mt5_quotes",
    description: "Read bounded quote and OHLC candle data from the user's own Exness MT5 Demo terminal.",
    handler: "mt5_quotes",
    scope: "mt5:read",
    readOnly: true,
    maxBodyBytes: 2048,
    inputSchema: object({
      connection_id: string({ minLength: 36, maxLength: 36 }),
      symbol: string({ minLength: 1, maxLength: 40, pattern: "^[A-Za-z0-9._-]+$" }),
      timeframe: string({ enum: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"] }),
      count: integer({ minimum: 1, maximum: 500 })
    }, ["connection_id", "symbol"])
  },
  {
    name: "nova_ai_chat",
    description: "Send a bounded research conversation to the NOVA AI adapter. Analysis only.",
    handler: "nova_ai_chat",
    scope: "research:invoke",
    readOnly: true,
    maxBodyBytes: 12000,
    inputSchema: object({
      messages: {
        type: "array", minItems: 1, maxItems: 12,
        items: object({
          role: string({ enum: ["user", "assistant"] }),
          content: string({ minLength: 1, maxLength: 1200 })
        }, ["role", "content"])
      }
    }, ["messages"])
  }
]);

const CAPABILITY_BY_NAME = new Map(CAPABILITIES.map((item) => [item.name, item]));

export function getCapability(name) {
  return CAPABILITY_BY_NAME.get(name) || null;
}

export function validateCapabilityInput(capability, input) {
  if (!capability || !input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_request" };
  }
  const schema = capability.inputSchema;
  const properties = schema.properties || {};
  if (Object.keys(input).some((key) => !Object.hasOwn(properties, key))) {
    return { ok: false, error: "invalid_request" };
  }
  if ((schema.required || []).some((key) => !Object.hasOwn(input, key))) {
    return { ok: false, error: "invalid_request" };
  }
  for (const [key, value] of Object.entries(input)) {
    const rule = properties[key];
    if (rule.type === "string") {
      if (typeof value !== "string" || value.length < (rule.minLength || 0) ||
          value.length > (rule.maxLength || 4096)) return { ok: false, error: "invalid_request" };
      if (rule.enum && !rule.enum.includes(value)) return { ok: false, error: "invalid_request" };
      if (rule.pattern && !(new RegExp(rule.pattern).test(value))) return { ok: false, error: "invalid_request" };
    } else if (rule.type === "integer") {
      if (!Number.isInteger(value) || (rule.minimum !== undefined && value < rule.minimum) ||
          (rule.maximum !== undefined && value > rule.maximum)) return { ok: false, error: "invalid_request" };
    } else if (rule.type === "array") {
      if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) {
        return { ok: false, error: "invalid_request" };
      }
      for (const item of value) {
        const itemRule = rule.items;
        if (!item || typeof item !== "object" || Array.isArray(item) ||
            Object.keys(item).some((k) => !Object.hasOwn(itemRule.properties, k)) ||
            itemRule.required.some((k) => !Object.hasOwn(item, k)) ||
            typeof item.role !== "string" || !itemRule.properties.role.enum.includes(item.role) ||
            typeof item.content !== "string" || item.content.length < 1 ||
            item.content.length > itemRule.properties.content.maxLength) {
          return { ok: false, error: "invalid_request" };
        }
      }
    }
  }
  return { ok: true };
}

export function successEnvelope(requestId, data) {
  return { ok: true, contractVersion: CONTRACT_VERSION, requestId, data };
}

export function errorEnvelope(requestId, code, message, retryable = false) {
  return {
    ok: false, contractVersion: CONTRACT_VERSION, requestId,
    error: { code, message, retryable: Boolean(retryable) }
  };
}
