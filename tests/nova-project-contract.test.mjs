import test from "node:test";
import assert from "node:assert/strict";
import {
  NOVA_PROJECT_REQUEST_SCHEMA,
  NOVA_PROJECT_RESPONSE_SCHEMA,
  validateProjectRegistration,
  validateProjectRequest,
  validateProjectResponse,
} from "../shared/nova-project-contract.mjs";

const project = Object.freeze({
  project_id: "trading",
  api_version: "1",
  owner_scope: "server-managed-project-owner",
  capabilities: ["market.quote.read", "research.analysis.run"],
  data_classification: "tenant",
  health_state: "configured",
  release_ref: { repository: "vutting895/NOVA-QUANTUM-TRADING", commit_sha: "a".repeat(40), environment: "preview" },
  limits: { max_request_bytes: 16_384, concurrency: 4, timeout_ms: 5_000, daily_quota: 1_000 },
});
const request = () => ({
  schema: NOVA_PROJECT_REQUEST_SCHEMA,
  request_id: "123e4567-e89b-42d3-a456-426614174000",
  project_id: "trading",
  api_version: "1",
  intent: "research.market-regime",
  capability: "market.quote.read",
  resource: { kind: "instrument", id: "XAUUSD" },
  input: { timeframe: "M15" },
  idempotency_key: "market-read-2026-11-05",
  requested_at: "2026-11-05T12:00:00Z",
});

test("accepts a valid server-owned project registration", () => assert.equal(validateProjectRegistration(project).valid, true));
test("rejects malformed or caller-extended project registration", () => {
  assert.equal(validateProjectRegistration(null).reason, "project_record_invalid");
  assert.equal(validateProjectRegistration({ ...project, tenant_id: "attacker" }).reason, "project_record_unknown_fields");
  assert.equal(validateProjectRegistration({ ...project, project_id: "../trading" }).reason, "project_id_invalid");
  assert.equal(validateProjectRegistration({ ...project, capabilities: ["broker.order.submit"] }).reason, "project_capability_forbidden");
  assert.equal(validateProjectRegistration({ ...project, capabilities: ["filesystem.read"] }).reason, "project_capability_not_allowlisted");
  assert.equal(validateProjectRegistration({ ...project, limits: { ...project.limits, timeout_ms: 90_000 } }).reason, "project_limits_out_of_range");
});
test("accepts a valid request bound to the registered project and capability", () => {
  const result = validateProjectRequest(request(), project);
  assert.equal(result.valid, true);
  assert.equal(result.value.project_id, "trading");
  assert.equal(result.value.capability, "market.quote.read");
});
test("rejects identity, tenant, secret, route, and unknown fields from caller input", () => {
  for (const field of ["tenant_id", "user_id", "access_token", "authorization", "secret", "credential", "upstream_url"]) {
    assert.equal(validateProjectRequest({ ...request(), [field]: "untrusted" }, project).reason, "request_unknown_fields", field);
  }
});
test("rejects identity and secret fields nested inside project input", () => {
  for (const input of [
    { tenant: "other-tenant" },
    { nested: { user_id: "other-user" } },
    { provider: { authorization: "Bearer secret" } },
    { endpoint: { upstream_url: "https://attacker.invalid" } },
  ]) {
    assert.equal(validateProjectRequest({ ...request(), input }, project).reason, "input_contains_identity_or_secret_field");
  }
});
test("rejects project mismatch, version mismatch, and unregistered capability", () => {
  assert.equal(validateProjectRequest({ ...request(), project_id: "video" }, project).reason, "project_id_mismatch");
  assert.equal(validateProjectRequest({ ...request(), api_version: "2" }, project).reason, "api_version_mismatch");
  assert.equal(validateProjectRequest({ ...request(), capability: "broker.order.submit" }, project).reason, "capability_not_allowlisted");
  assert.equal(validateProjectRequest({ ...request(), capability: "learning.evaluation.read" }, project).reason, "capability_not_registered_for_project");
});
test("rejects malformed request identifiers, resources, timestamps and idempotency keys", () => {
  assert.equal(validateProjectRequest({ ...request(), request_id: "not-a-uuid" }, project).reason, "request_id_invalid");
  assert.equal(validateProjectRequest({ ...request(), resource: { kind: "instrument", id: "" } }, project).reason, "resource_invalid");
  assert.equal(validateProjectRequest({ ...request(), requested_at: "yesterday" }, project).reason, "requested_at_invalid");
  assert.equal(validateProjectRequest({ ...request(), idempotency_key: "short" }, project).reason, "idempotency_key_invalid");
});
test("rejects oversized payloads and invalid registry context", () => {
  const p = { ...project, limits: { ...project.limits, max_request_bytes: 100 } };
  assert.equal(validateProjectRequest(request(), p).reason, "request_too_large");
  assert.equal(validateProjectRequest(request(), { ...project, capabilities: ["broker.order.submit"] }).reason, "project_registry_record_invalid");
});
test("validates successful and accepted response envelopes", () => {
  for (const status of ["ok", "accepted"]) {
    const response = {
      schema: NOVA_PROJECT_RESPONSE_SCHEMA, request_id: request().request_id, status,
      data_timestamp: "2026-11-05T12:00:00Z",
      provenance: { source: "exness-demo", version: "adapter-v1", checksum: null },
      result: { price: "3987.120" },
    };
    assert.equal(validateProjectResponse(response, request().request_id).valid, true);
  }
});
test("rejects response correlation, provenance, and error/result ambiguity", () => {
  const base = {
    schema: NOVA_PROJECT_RESPONSE_SCHEMA, request_id: request().request_id, status: "ok",
    data_timestamp: null, provenance: { source: "test", version: "1", checksum: null }, result: {},
  };
  assert.equal(validateProjectResponse({ ...base, request_id: "wrong" }, request().request_id).reason, "response_request_id_mismatch");
  assert.equal(validateProjectResponse({ ...base, provenance: { source: "test", version: "1", secret: "x" } }, request().request_id).reason, "response_provenance_invalid");
  assert.equal(validateProjectResponse({ ...base, status: "error", error: { code: "failed", message: "No data" } }, request().request_id).reason, "response_error_invalid");
  assert.equal(validateProjectResponse({ ...base, status: "error", result: undefined, error: { code: "failed", message: "No data" } }, request().request_id).valid, true);
});
