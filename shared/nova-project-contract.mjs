/**
 * NOVA Project Contract v1 — dependency-free boundary validation.
 * This validates wire shapes against a server-owned project registry record.
 * It is not authentication, tenant authorization, rate limiting, or an API server.
 */
export const NOVA_PROJECT_REQUEST_SCHEMA = "nova.project.request.v1";
export const NOVA_PROJECT_RESPONSE_SCHEMA = "nova.project.response.v1";

export const NOVA_PROJECT_CAPABILITIES = Object.freeze([
  "system.health.read", "integration.registry.read", "connection.own.read",
  "market.quote.read", "market.candles.read", "account.summary.read",
  "research.analysis.run", "strategy.draft.create", "approval.request.create",
  "learning.evaluation.read",
]);

const FORBIDDEN_CAPABILITIES = new Set([
  "broker.order.submit", "broker.order.modify", "broker.order.cancel",
  "broker.position.close", "broker.funds.transfer", "broker.funds.withdraw",
  "broker.credentials.export", "secret.value.read", "secret.value.write",
  "runtime.arbitrary-url.fetch",
]);
const FORBIDDEN_INPUT_KEYS = new Set([
  "user", "userid", "tenant", "tenantid", "accesstoken", "authorization",
  "token", "bearertoken", "secret", "secretvalue", "credential", "password",
  "apikey", "upstreamurl", "endpointurl", "webhookurl", "url",
]);
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "user", "userid", "tenant", "tenantid", "accesstoken", "authorization",
  "token", "bearertoken", "secret", "secretvalue", "credential", "password",
  "apikey", "clientsecret", "privatekey", "refreshtoken", "upstreamurl",
  "endpointurl", "webhookurl",
]);
const CLASSIFICATIONS = new Set(["public", "internal", "tenant", "confidential"]);
const HEALTH_STATES = new Set(["not_configured", "configured", "reachable", "authenticated", "data_verified", "degraded", "unavailable"]);
const REQUEST_FIELDS = new Set(["schema", "request_id", "project_id", "api_version", "intent", "capability", "resource", "input", "idempotency_key", "requested_at"]);
const RESPONSE_FIELDS = new Set(["schema", "request_id", "status", "data_timestamp", "provenance", "result", "error"]);

const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const fail = (reason) => Object.freeze({ valid: false, reason });
const ok = (value) => Object.freeze({ valid: true, value });
function isString(value, min, max, pattern) {
  return typeof value === "string" && value.length >= min && value.length <= max && (!pattern || pattern.test(value));
}
function isTimestamp(value) {
  return isString(value, 20, 40, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/) && Number.isFinite(Date.parse(value));
}
function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}
function normalizedKey(key) {
  return key.toLowerCase().replace(/[-_.]/g, "");
}
function containsForbiddenInputKey(value, depth = 0) {
  if (depth > 16) return true;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenInputKey(item, depth + 1));
  if (!plainObject(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_INPUT_KEYS.has(normalizedKey(key)) ||
    containsForbiddenInputKey(child, depth + 1));
}
function containsForbiddenOutput(value, depth = 0) {
  if (depth > 16) return true;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenOutput(item, depth + 1));
  if (plainObject(value)) {
    return Object.entries(value).some(([key, child]) =>
      FORBIDDEN_OUTPUT_KEYS.has(normalizedKey(key)) ||
      containsForbiddenOutput(child, depth + 1));
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return typeof value === "string" && /(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i.test(value);
  }
  return typeof value === "number" && Number.isFinite(value) ? false : true;
}
function serializedByteLength(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Infinity;
  }
}

export function validateProjectRegistration(record) {
  if (!plainObject(record)) return fail("project_record_invalid");
  const allowed = new Set(["project_id", "api_version", "owner_scope", "capabilities", "data_classification", "health_state", "release_ref", "limits"]);
  if (!hasOnlyKeys(record, allowed)) return fail("project_record_unknown_fields");
  if (!isString(record.project_id, 2, 64, /^[a-z][a-z0-9-]*$/)) return fail("project_id_invalid");
  if (!isString(record.api_version, 1, 16, /^1(?:\.\d{1,3})?$/)) return fail("api_version_unsupported");
  if (!isString(record.owner_scope, 2, 128)) return fail("owner_scope_invalid");
  if (!Array.isArray(record.capabilities) || record.capabilities.length > NOVA_PROJECT_CAPABILITIES.length) return fail("project_capabilities_invalid");
  if (new Set(record.capabilities).size !== record.capabilities.length) return fail("project_capabilities_duplicate");
  for (const capability of record.capabilities) {
    if (typeof capability !== "string" || FORBIDDEN_CAPABILITIES.has(capability)) return fail("project_capability_forbidden");
    if (!NOVA_PROJECT_CAPABILITIES.includes(capability)) return fail("project_capability_not_allowlisted");
  }
  if (!CLASSIFICATIONS.has(record.data_classification)) return fail("data_classification_invalid");
  if (!HEALTH_STATES.has(record.health_state)) return fail("health_state_invalid");
  if (!plainObject(record.release_ref) ||
      !hasOnlyKeys(record.release_ref, new Set(["repository", "commit_sha", "environment"])) ||
      !isString(record.release_ref.repository, 3, 200, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) ||
      !isString(record.release_ref.commit_sha, 40, 64, /^[a-f0-9]{40,64}$/) ||
      !isString(record.release_ref.environment, 3, 24, /^(development|preview|staging|production)$/)) return fail("release_ref_invalid");
  if (!plainObject(record.limits) || !hasOnlyKeys(record.limits, new Set(["max_request_bytes", "concurrency", "timeout_ms", "daily_quota"]))) return fail("project_limits_invalid");
  const { max_request_bytes, concurrency, timeout_ms, daily_quota } = record.limits;
  if (!Number.isInteger(max_request_bytes) || max_request_bytes < 1 || max_request_bytes > 1_048_576 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 ||
      !Number.isInteger(timeout_ms) || timeout_ms < 100 || timeout_ms > 30_000 ||
      !Number.isInteger(daily_quota) || daily_quota < 1 || daily_quota > 1_000_000) return fail("project_limits_out_of_range");
  return ok(record);
}

export function validateProjectRequest(envelope, projectRecord) {
  if (!validateProjectRegistration(projectRecord).valid) return fail("project_registry_record_invalid");
  if (!plainObject(envelope)) return fail("request_invalid");
  if (!hasOnlyKeys(envelope, REQUEST_FIELDS)) return fail("request_unknown_fields");
  if (envelope.schema !== NOVA_PROJECT_REQUEST_SCHEMA) return fail("request_schema_unsupported");
  if (!isString(envelope.request_id, 36, 36, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) return fail("request_id_invalid");
  if (envelope.project_id !== projectRecord.project_id) return fail("project_id_mismatch");
  if (envelope.api_version !== projectRecord.api_version) return fail("api_version_mismatch");
  if (!isString(envelope.intent, 3, 96, /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/)) return fail("intent_invalid");
  if (typeof envelope.capability !== "string" || !NOVA_PROJECT_CAPABILITIES.includes(envelope.capability) || FORBIDDEN_CAPABILITIES.has(envelope.capability)) return fail("capability_not_allowlisted");
  if (!projectRecord.capabilities.includes(envelope.capability)) return fail("capability_not_registered_for_project");
  if (!plainObject(envelope.resource) || !hasOnlyKeys(envelope.resource, new Set(["kind", "id"])) ||
      !isString(envelope.resource.kind, 2, 48, /^[a-z][a-z0-9_-]*$/) || !isString(envelope.resource.id, 1, 128)) return fail("resource_invalid");
  if (!plainObject(envelope.input)) return fail("input_invalid");
  if (containsForbiddenInputKey(envelope.input)) return fail("input_contains_identity_or_secret_field");
  if (serializedByteLength(envelope) > projectRecord.limits.max_request_bytes) return fail("request_too_large");
  if (!isString(envelope.idempotency_key, 16, 128, /^[A-Za-z0-9._:-]+$/)) return fail("idempotency_key_invalid");
  if (!isTimestamp(envelope.requested_at)) return fail("requested_at_invalid");
  return ok(Object.freeze({
    schema: NOVA_PROJECT_REQUEST_SCHEMA, request_id: envelope.request_id,
    project_id: projectRecord.project_id, api_version: projectRecord.api_version,
    intent: envelope.intent, capability: envelope.capability,
    resource: Object.freeze({ kind: envelope.resource.kind, id: envelope.resource.id }),
    input: envelope.input, idempotency_key: envelope.idempotency_key, requested_at: envelope.requested_at,
  }));
}

export function validateProjectResponse(response, expectedRequestId) {
  if (!plainObject(response)) return fail("response_invalid");
  if (!hasOnlyKeys(response, RESPONSE_FIELDS)) return fail("response_unknown_fields");
  if (response.schema !== NOVA_PROJECT_RESPONSE_SCHEMA) return fail("response_schema_unsupported");
  if (response.request_id !== expectedRequestId) return fail("response_request_id_mismatch");
  if (!["ok", "accepted", "error"].includes(response.status)) return fail("response_status_invalid");
  if (response.data_timestamp !== null && !isTimestamp(response.data_timestamp)) return fail("response_data_timestamp_invalid");
  if (!plainObject(response.provenance) || !hasOnlyKeys(response.provenance, new Set(["source", "version", "checksum"])) ||
      !isString(response.provenance.source, 1, 128) || !isString(response.provenance.version, 1, 64) ||
      (response.provenance.checksum !== null && !isString(response.provenance.checksum, 16, 128, /^[A-Za-z0-9._:-]+$/))) return fail("response_provenance_invalid");
  if (response.status === "error") {
    if (!plainObject(response.error) || !hasOnlyKeys(response.error, new Set(["code", "message"])) ||
        !isString(response.error.code, 1, 64) || !isString(response.error.message, 1, 240) ||
        containsForbiddenOutput(response.error.message) || response.result !== undefined) return fail("response_error_invalid");
  } else if (response.error !== undefined || !Object.prototype.hasOwnProperty.call(response, "result") ||
      containsForbiddenOutput(response.result)) return fail("response_result_invalid");
  return ok(response);
}
