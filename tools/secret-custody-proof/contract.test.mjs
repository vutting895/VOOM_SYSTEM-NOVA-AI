import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const requestSchema = JSON.parse(read("tools/secret-custody-proof/contracts/provider-operation.request.schema.json"));
const responseSchema = JSON.parse(read("tools/secret-custody-proof/contracts/provider-operation.response.schema.json"));
const adr = read("docs/architecture/NOVA-SEPARATE-SECRET-CUSTODY-ADR.md");
const threatModel = read("docs/security/NOVA-SEPARATE-SECRET-CUSTODY-THREAT-MODEL.md");
const apiContract = read("docs/architecture/NOVA-SECRET-CUSTODY-API-DATA-CONTRACT.md");

const forbidden = new Set([
  "owner_id", "tenant_id", "binding_id", "secret_id", "vault_id", "custody_ref",
  "secret_value", "api_key", "api_secret", "access_token", "database_url",
  "provider_url", "authorization", "private_key", "dek", "kek", "ciphertext",
  "wrapped_dek", "provider_auth_header"
]);

function hasForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    forbidden.has(key.toLowerCase()) || hasForbiddenKey(child)
  );
}

// Test-only validator for the exact JSON Schema vocabulary used by these contracts.
// Unknown keywords/formats fail closed so schema evolution cannot silently bypass tests.
const supportedSchemaKeywords = new Set([
  "$schema", "$id", "title", "description", "default", "examples",
  "type", "additionalProperties", "required", "properties", "enum", "items",
  "maxItems", "minItems", "pattern", "format", "minimum", "maximum",
  "maxLength", "minLength"
]);

function isRfc3339DateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/i.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
    && Number.isFinite(Date.parse(value));
}

function schemaErrors(value, schema, path = "$") {
  const errors = [];
  for (const keyword of Object.keys(schema)) {
    if (!supportedSchemaKeywords.has(keyword)) errors.push(path + ": unsupported schema keyword " + keyword);
  }

  if (schema.type) {
    const matches = schema.type === "object"
      ? value !== null && typeof value === "object" && !Array.isArray(value)
      : schema.type === "array"
        ? Array.isArray(value)
        : schema.type === "string"
          ? typeof value === "string"
          : schema.type === "boolean"
            ? typeof value === "boolean"
            : schema.type === "number"
              ? typeof value === "number" && Number.isFinite(value)
              : schema.type === "integer"
                ? typeof value === "number" && Number.isInteger(value)
                : false;
    if (!matches) return [...errors, path + ": expected " + schema.type];
  }

  if (schema.enum && !schema.enum.some(candidate => Object.is(candidate, value))) {
    errors.push(path + ": value is not in enum");
  }
  if (schema.format === "uuid" && (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )) errors.push(path + ": invalid uuid");
  if (schema.format === "date-time" && !isRfc3339DateTime(value)) {
    errors.push(path + ": invalid date-time");
  }
  if (schema.format && !["uuid", "date-time"].includes(schema.format)) {
    errors.push(path + ": unsupported format " + schema.format);
  }
  if (schema.pattern && (typeof value !== "string" || !new RegExp(schema.pattern).test(value))) {
    errors.push(path + ": pattern mismatch");
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(path + ": string too short");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(path + ": string too long");
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + ": below minimum");
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(path + ": above maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + ": too few items");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + ": too many items");
    if (schema.items) value.forEach((item, index) => {
      errors.push(...schemaErrors(item, schema.items, path + "[" + index + "]"));
    });
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(path + ": missing required property " + key);
    }
    const properties = schema.properties || {};
    const known = new Set(Object.keys(properties));
    for (const key of Object.keys(value)) {
      if (known.has(key)) continue;
      if (schema.additionalProperties === false) {
        errors.push(path + "." + key + ": additional property is not allowed");
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...schemaErrors(value[key], schema.additionalProperties, path + "." + key));
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...schemaErrors(value[key], propertySchema, path + "." + key));
    }
  }
  return errors;
}

function validRequest(value) {
  return schemaErrors(value, requestSchema).length === 0 && !hasForbiddenKey(value);
}

function validResponse(value) {
  return schemaErrors(value, responseSchema).length === 0 && !hasForbiddenKey(value);
}

test("contract schemas are strict and match the selected separate custody API", () => {
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.parameters.additionalProperties, false);
  const capabilities = requestSchema.properties.capability.enum;
  assert.equal(new Set(capabilities).size, capabilities.length, "capability enum must not contain duplicates");
  assert.deepEqual(capabilities, [
    "account.summary.read",
    "balances.read",
    "positions.read",
    "orders.read",
    "quotes.read",
    "credential.status.read"
  ]);
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(responseSchema.properties.result.additionalProperties, false);
  assert.match(adr, /independently verifies the customer session/i);
  assert.match(adr, /plaintext customer credentials/i);
  assert.match(threatModel, /service_role/i);
  assert.match(apiContract, /OUTCOME_UNKNOWN/);
  assert.match(apiContract, /Idempotency-Key/);
  assert.match(apiContract, /Cache-Control: no-store/);
  assert.match(apiContract, /Hyperdrive is not part of the selected Option C/i);
  assert.match(apiContract, /no-cache behavior proven at every layer/i);
});

test("provider operation request fixtures validate against the published JSON Schema", () => {
  const valid = {
    connection_id: "00000000-0000-4000-8000-000000000101",
    capability: "account.summary.read",
    parameters: { symbols: ["XAUUSD"], since: "2026-11-01t12:00:00+07:00", limit: 50 },
    policy_version: "read-only-v1",
    client_correlation_id: "chat-session-01"
  };
  assert.equal(validRequest(valid), true);

  const invalid = [
    { ...valid, connection_id: "not-a-uuid" },
    { ...valid, capability: "trade.submit" },
    { ...valid, parameters: { symbols: ["XAU USD"] } },
    { ...valid, parameters: { symbols: Array(51).fill("XAUUSD") } },
    { ...valid, parameters: { since: "2026-11-01" } },
    { ...valid, parameters: { since: "2026-11-01T12:00:00" } },
    { ...valid, parameters: { limit: 0 } },
    { ...valid, parameters: { limit: 501 } },
    { ...valid, policy_version: "not a valid policy version" },
    { ...valid, client_correlation_id: "x".repeat(65) },
    { ...valid, unexpected: "attacker-controlled" },
    { ...valid, parameters: { secret_value: "synthetic-only" } }
  ];
  for (const candidate of invalid) assert.equal(validRequest(candidate), false);
});

test("provider operation response fixtures validate against the published JSON Schema", () => {
  const valid = {
    operation_id: "10000000-0000-4000-8000-000000000201",
    state: "SUCCEEDED",
    result_code: "OK",
    retry_after_ms: 250,
    provider_reference: "opaque-provider-ref",
    reconciliation_required: false,
    created_at: "2026-11-01T05:00:00.000Z",
    updated_at: "2026-11-01T12:00:01+07:00",
    result: {
      account: { balance: 1000, equity: 1000, currency: "USD" },
      quotes: [{ symbol: "XAUUSD", bid: 2300.1, ask: 2300.2, timestamp: "2026-11-01T05:00:00.000Z" }],
      positions: [{ symbol: "XAUUSD", side: "long", volume: 0.1, unrealized_pnl: 12.5 }],
      rotation: { state: "ROTATION_REQUIRED", generation: 2 }
    }
  };
  assert.equal(validResponse(valid), true);

  const invalid = [
    { ...valid, operation_id: "not-a-uuid" },
    { ...valid, state: "RETRY_WITH_OLD_SECRET" },
    { ...valid, retry_after_ms: 99 },
    { ...valid, created_at: "2026-11-01" },
    { ...valid, result: { account: { balance: "1000" } } },
    { ...valid, result: { account: { balance: Infinity } } },
    { ...valid, result: { quotes: [{ symbol: "XAUUSD", bid: 1 }] } },
    { ...valid, result: { quotes: [{ symbol: "XAUUSD", bid: 1, ask: 2, timestamp: "2026-11-01" }] } },
    { ...valid, result: { quotes: [{ symbol: "X".repeat(33), bid: 1, ask: 2 }] } },
    { ...valid, result: { quotes: Array(501).fill({ symbol: "XAUUSD", bid: 1, ask: 2 }) } },
    { ...valid, result: { positions: [{ symbol: "XAUUSD", side: "buy", volume: 1 }] } },
    { ...valid, result: { rotation: { state: "ROTATED", generation: 0 } } },
    { ...valid, secret_value: "plaintext" },
    { ...valid, unexpected: "additional-property" }
  ];
  for (const candidate of invalid) assert.equal(validResponse(candidate), false);
});

test("schema validation fails closed when a contract introduces an unsupported keyword", () => {
  assert.notEqual(schemaErrors({}, { type: "object", unsupportedKeyword: true }).length, 0);
});

test("durable operation identity is independent of signing key rotation", () => {
  const ledger = new Map();
  const claim = ({ principal, binding, operation, keyId, fingerprint }) => {
    const id = [principal, binding, operation].join(":");
    const prior = ledger.get(id);
    if (!prior) {
      ledger.set(id, { fingerprint, state: "RUNNING", keyId });
      return "CLAIMED";
    }
    if (prior.fingerprint !== fingerprint) return "IDEMPOTENCY_CONFLICT";
    return prior.state;
  };
  const request = { principal: "user-a", binding: "binding-a", operation: "op-1", keyId: "signing-v1", fingerprint: "digest-a" };
  assert.equal(claim(request), "CLAIMED");
  ledger.get("user-a:binding-a:op-1").state = "SUCCEEDED";
  assert.equal(claim({ ...request, keyId: "signing-v2" }), "SUCCEEDED");
  assert.equal(claim({ ...request, fingerprint: "digest-b" }), "IDEMPOTENCY_CONFLICT");
});

test("ambiguous provider outcomes remain reconciliation-required and cannot redispatch", () => {
  const ledger = new Map([["op-2", "RUNNING"]]);
  const timeout = operationId => ledger.set(operationId, "OUTCOME_UNKNOWN");
  const retry = operationId => ledger.get(operationId) === "OUTCOME_UNKNOWN" ? "RECONCILIATION_REQUIRED" : ledger.get(operationId);
  timeout("op-2");
  assert.equal(retry("op-2"), "RECONCILIATION_REQUIRED");
  ledger.set("op-2", "SUCCEEDED");
  assert.equal(retry("op-2"), "SUCCEEDED");
});
