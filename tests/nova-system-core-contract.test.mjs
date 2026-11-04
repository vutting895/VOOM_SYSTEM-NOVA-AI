import test from "node:test";
import assert from "node:assert/strict";
import {
  NOVA_SYSTEM_CORE,
  NOVA_SYSTEM_CORE_VERSION,
  evaluateCoreCapability,
} from "../shared/nova-system-core-contract.mjs";

const trusted = { identityVerified: true, tenantAuthorized: true };

test("publishes one central core with explicit module ownership", () => {
  assert.equal(NOVA_SYSTEM_CORE_VERSION, "nova-system-core.v1");
  assert.equal(NOVA_SYSTEM_CORE.controlPlane, "integrations/system-hub");
  assert.deepEqual(
    NOVA_SYSTEM_CORE.modules.map((module) => module.id),
    ["identity", "security", "intelligence", "data", "workflow", "learning", "integration", "observability"],
  );
  assert.equal(new Set(NOVA_SYSTEM_CORE.modules.map((module) => module.id)).size, 8);
});

test("keeps financial execution and secret access disabled by policy", () => {
  assert.equal(NOVA_SYSTEM_CORE.invariants.ordersEnabled, false);
  assert.equal(NOVA_SYSTEM_CORE.invariants.executionEnabled, false);
  assert.equal(NOVA_SYSTEM_CORE.invariants.liveTradingEnabled, false);
  assert.ok(NOVA_SYSTEM_CORE.forbiddenCapabilities.includes("secret.value.read"));
  assert.ok(NOVA_SYSTEM_CORE.forbiddenCapabilities.includes("broker.order.submit"));
});

test("allows only allowlisted read and research capabilities with trusted context", () => {
  const result = evaluateCoreCapability({ capability: "market.quote.read" }, trusted);
  assert.equal(result.allowed, true);
  assert.equal(result.policyVersion, NOVA_SYSTEM_CORE_VERSION);
  assert.equal(result.executionEnabled, false);
});

test("fails closed when identity or tenant authorization is missing", () => {
  assert.equal(evaluateCoreCapability({ capability: "market.quote.read" }, {}).reason, "identity_unverified");
  assert.equal(
    evaluateCoreCapability({ capability: "market.quote.read" }, { identityVerified: true }).reason,
    "tenant_not_authorized",
  );
  assert.equal(evaluateCoreCapability({ capability: "market.quote.read" }, null).allowed, false);
});

test("denies broker writes, secret access, unknown capabilities and arbitrary upstream URLs", () => {
  for (const capability of NOVA_SYSTEM_CORE.forbiddenCapabilities) {
    assert.equal(evaluateCoreCapability({ capability }, trusted).allowed, false, capability);
  }
  assert.equal(
    evaluateCoreCapability({ capability: "filesystem.delete" }, trusted).reason,
    "capability_not_allowlisted",
  );
  assert.equal(
    evaluateCoreCapability({ capability: "market.quote.read", upstreamUrl: "https://attacker.invalid" }, trusted).reason,
    "caller_selected_upstream_forbidden",
  );
});

test("rejects secret-bearing request fields and malformed requests", () => {
  assert.equal(
    evaluateCoreCapability({ capability: "market.quote.read", secret: "synthetic" }, trusted).reason,
    "secret_material_forbidden",
  );
  assert.equal(evaluateCoreCapability(null, trusted).reason, "request_invalid");
  assert.equal(evaluateCoreCapability({ capability: "" }, trusted).reason, "capability_invalid");
  assert.equal(evaluateCoreCapability({ capability: "market.quote.read", tenantId: "attacker-controlled" }, trusted).reason, "unknown_request_fields");
});
