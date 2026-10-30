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

function onlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => allowed.includes(key));
}

function validRequest(value) {
  if (!onlyKeys(value, Object.keys(requestSchema.properties))) return false;
  if (!requestSchema.required.every(key => Object.hasOwn(value, key))) return false;
  if (!/^[0-9a-f-]{36}$/i.test(value.connection_id)) return false;
  if (!requestSchema.properties.capability.enum.includes(value.capability)) return false;
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(value.policy_version)) return false;
  if (!onlyKeys(value.parameters, ["symbols", "since", "limit"])) return false;
  if (value.parameters.symbols && (!Array.isArray(value.parameters.symbols) || value.parameters.symbols.length > 50)) return false;
  if (value.parameters.limit !== undefined && (!Number.isInteger(value.parameters.limit) || value.parameters.limit < 1 || value.parameters.limit > 500)) return false;
  if (value.client_correlation_id !== undefined && !/^[A-Za-z0-9._:-]{1,64}$/.test(value.client_correlation_id)) return false;
  return !hasForbiddenKey(value);
}

function validResult(result) {
  if (!onlyKeys(result, ["account", "quotes", "positions", "rotation"])) return false;
  if (result.account && !onlyKeys(result.account, ["balance", "equity", "margin", "free_margin", "currency"])) return false;
  if (result.rotation && !onlyKeys(result.rotation, ["state", "generation"])) return false;
  if (result.quotes && (!Array.isArray(result.quotes) || result.quotes.some(item => !onlyKeys(item, ["symbol", "bid", "ask", "timestamp"])))) return false;
  if (result.positions && (!Array.isArray(result.positions) || result.positions.some(item => !onlyKeys(item, ["symbol", "side", "volume", "unrealized_pnl"])))) return false;
  return true;
}

function validResponse(value) {
  if (!onlyKeys(value, Object.keys(responseSchema.properties))) return false;
  if (!responseSchema.required.every(key => Object.hasOwn(value, key))) return false;
  if (!/^[0-9a-f-]{36}$/i.test(value.operation_id)) return false;
  if (!responseSchema.properties.state.enum.includes(value.state)) return false;
  if (value.result_code && !/^[A-Z0-9_]{1,64}$/.test(value.result_code)) return false;
  if (value.result && !validResult(value.result)) return false;
  return !hasForbiddenKey(value);
}

test("contract schemas are strict and match the selected separate custody API", () => {
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.parameters.additionalProperties, false);
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(responseSchema.properties.result.additionalProperties, false);
  assert.match(adr, /independently verifies the customer session/i);
  assert.match(adr, /plaintext customer credentials/i);
  assert.match(threatModel, /service_role/i);
  assert.match(apiContract, /OUTCOME_UNKNOWN/);
  assert.match(apiContract, /Idempotency-Key/);
});

test("provider operation request accepts only connection, capability, policy and bounded parameters", () => {
  const valid = {
    connection_id: "00000000-0000-4000-8000-000000000101",
    capability: "account.summary.read",
    parameters: {},
    policy_version: "read-only-v1"
  };
  assert.equal(validRequest(valid), true);
  for (const field of ["owner_id", "tenant_id", "binding_id", "secret_id", "secret_value", "provider_url", "access_token", "provider"]) {
    assert.equal(validRequest({ ...valid, [field]: "attacker-controlled" }), false, field);
  }
  assert.equal(validRequest({ ...valid, parameters: { symbols: ["XAUUSD"], limit: 50 } }), true);
  assert.equal(validRequest({ ...valid, parameters: { arbitrary_sql: "select 1" } }), false);
  assert.equal(validRequest({ ...valid, capability: "trade.submit" }), false);
});

test("custody responses contain only sanitized business data and safe operation metadata", () => {
  const valid = {
    operation_id: "10000000-0000-4000-8000-000000000201",
    state: "SUCCEEDED",
    result_code: "OK",
    provider_reference: "opaque-provider-ref",
    result: { account: { balance: 1000, equity: 1000, currency: "USD" } }
  };
  assert.equal(validResponse(valid), true);
  assert.equal(validResponse({ ...valid, result: { account: { balance: 1000, access_token: "secret" } } }), false);
  assert.equal(validResponse({ ...valid, secret_value: "plaintext" }), false);
  assert.equal(validResponse({ ...valid, result: { account: { balance: 1000, arbitrary: "data" } } }), false);
  assert.equal(validResponse({ ...valid, state: "RETRY_WITH_OLD_SECRET" }), false);
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
