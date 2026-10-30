import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const requestSchema = JSON.parse(readFileSync(new URL("./contracts/provider-operation.request.schema.json", import.meta.url), "utf8"));
const responseSchema = JSON.parse(readFileSync(new URL("./contracts/provider-operation.response.schema.json", import.meta.url), "utf8"));
const adr = readFileSync(new URL("../../docs/implementation/NOVA-SECRET-CUSTODY-PLANE-ADR.md", import.meta.url), "utf8");

const forbidden = new Set([
  "owner_id", "tenant_id", "secret_id", "vault_id", "secret_value",
  "access_token", "database_url", "provider_url", "role", "capabilities",
  "private_key", "dek", "kek", "ciphertext"
]);

function hasForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    forbidden.has(key.toLowerCase()) || hasForbiddenKey(child)
  );
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => allowed.includes(key));
}

function validateRequest(value) {
  const allowed = Object.keys(requestSchema.properties);
  if (!hasOnlyKeys(value, allowed)) return false;
  if (!requestSchema.required.every(key => Object.hasOwn(value, key))) return false;
  if (!/^[0-9a-f-]{36}$/i.test(value.connection_id)) return false;
  if (!/^[a-z0-9_-]{1,64}$/.test(value.provider)) return false;
  if (!["demo", "sandbox", "production"].includes(value.environment)) return false;
  if (!["account.read", "positions.read", "quotes.read", "secret.rotate", "secret.revoke"].includes(value.operation)) return false;
  if (!hasOnlyKeys(value.request, ["symbols", "since", "limit"])) return false;
  if (value.request.symbols && (!Array.isArray(value.request.symbols) || value.request.symbols.length > 50)) return false;
  if (value.request.limit !== undefined && (!Number.isInteger(value.request.limit) || value.request.limit < 1 || value.request.limit > 500)) return false;
  return !hasForbiddenKey(value);
}

function validateResponse(value) {
  if (!hasOnlyKeys(value, Object.keys(responseSchema.properties))) return false;
  if (!responseSchema.required.every(key => Object.hasOwn(value, key))) return false;
  if (!/^[0-9a-f-]{36}$/i.test(value.operation_id)) return false;
  if (!["SUCCEEDED", "FAILED_FINAL", "IN_PROGRESS", "OUTCOME_UNKNOWN"].includes(value.state)) return false;
  if (value.safe_error_code && !/^[A-Z0-9_]{1,64}$/.test(value.safe_error_code)) return false;
  return !hasForbiddenKey(value);
}

test("custody request and response schemas reject undeclared fields by default", () => {
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.request.additionalProperties, false);
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(responseSchema.properties.result.additionalProperties, false);
  assert.match(adr, /custodian independently validates the Supabase token/i);
  assert.match(adr, /does not expose a general-purpose plaintext secret-retrieval endpoint/i);
});

test("valid operation request uses only connection reference and non-secret operation data", () => {
  const valid = {
    connection_id: "00000000-0000-4000-8000-000000000101",
    provider: "exness_mt5",
    environment: "demo",
    operation: "account.read",
    request: {}
  };
  assert.equal(validateRequest(valid), true);
  for (const field of ["owner_id", "tenant_id", "secret_id", "secret_value", "provider_url", "access_token"]) {
    assert.equal(validateRequest({ ...valid, [field]: "attacker-controlled" }), false, field);
  }
  assert.equal(validateRequest({ ...valid, request: { symbols: ["XAUUSD"], limit: 50 } }), true);
  assert.equal(validateRequest({ ...valid, request: { arbitrary_sql: "select 1" } }), false);
});

test("custody response permits sanitized business results but rejects credential material", () => {
  const valid = {
    operation_id: "10000000-0000-4000-8000-000000000201",
    state: "SUCCEEDED",
    provider_reference: "opaque-provider-ref",
    result: { account: { balance: 1000, equity: 1000, currency: "USD" } }
  };
  assert.equal(validateResponse(valid), true);
  assert.equal(validateResponse({ ...valid, result: { account: { balance: 1000, access_token: "secret" } } }), false);
  assert.equal(validateResponse({ ...valid, secret_value: "plaintext" }), false);
  assert.equal(validateResponse({ ...valid, result: { account: { balance: 1000, arbitrary: "data" } } }), false);
  assert.equal(validateResponse({ ...valid, state: "RETRY_WITH_OLD_SECRET" }), false);
});

test("durable operation identity is stable across signing key rotation and fingerprint changes conflict", () => {
  const ledger = new Map();
  const claim = ({ tenant, operation, keyId, fingerprint }) => {
    const identity = tenant + ":" + operation;
    const existing = ledger.get(identity);
    if (!existing) {
      ledger.set(identity, { fingerprint, state: "IN_PROGRESS", keyId });
      return "CLAIMED";
    }
    if (existing.fingerprint !== fingerprint) return "FINGERPRINT_CONFLICT";
    return existing.state === "SUCCEEDED" ? "REPLAY_SUCCEEDED" : existing.state;
  };
  const op = { tenant: "tenant-a", operation: "op-1", keyId: "key-v1", fingerprint: "sha256:request-a" };
  assert.equal(claim(op), "CLAIMED");
  ledger.get("tenant-a:op-1").state = "SUCCEEDED";
  assert.equal(claim({ ...op, keyId: "key-v2" }), "REPLAY_SUCCEEDED");
  assert.equal(claim({ ...op, fingerprint: "sha256:request-b" }), "FINGERPRINT_CONFLICT");
});

test("ambiguous provider outcomes never authorize automatic redispatch", () => {
  const states = new Map([["op-2", "IN_PROGRESS"]]);
  const timeout = id => states.set(id, "OUTCOME_UNKNOWN");
  const retry = id => states.get(id) === "OUTCOME_UNKNOWN" ? "RECONCILIATION_REQUIRED" : states.get(id);
  timeout("op-2");
  assert.equal(retry("op-2"), "RECONCILIATION_REQUIRED");
  states.set("op-2", "SUCCEEDED");
  assert.equal(retry("op-2"), "SUCCEEDED");
});
