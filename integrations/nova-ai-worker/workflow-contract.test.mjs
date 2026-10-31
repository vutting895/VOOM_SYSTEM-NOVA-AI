import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_SCHEMA_VERSION,
  validateWorkflowDraft,
} from "./workflow-contract.js";

function validDraft() {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    title: "Customer onboarding review",
    description: "Validate a proposed customer onboarding sequence without changing external systems.",
    nodes: [
      { id: "start", type: "trigger.manual", config: {} },
      { id: "project", type: "data.select_fields", config: { fields: ["customerId", "email"] } },
      { id: "review", type: "gate.review_required", config: { reason: "A staff member must verify customer identity before any later action." } },
      { id: "preview", type: "output.preview", config: { label: "Onboarding preview" } },
    ],
    edges: [
      { from: "start", to: "project" },
      { from: "project", to: "review" },
      { from: "review", to: "preview" },
    ],
  };
}

test("registry is server-owned and contains only bounded draft-safe nodes", () => {
  assert.deepEqual(WORKFLOW_NODE_TYPES, [
    "trigger.manual",
    "data.select_fields",
    "gate.review_required",
    "output.preview",
  ]);
});

test("accepts a valid connected draft and forces non-executable flags", () => {
  const result = validateWorkflowDraft(validDraft());
  assert.equal(result.ok, true);
  assert.equal(result.value.executionMode, "draft_only");
  assert.equal(result.value.externalEffectsAllowed, false);
  assert.equal(result.value.brokerWritesAllowed, false);
  assert.equal(result.value.liveTradingEnabled, false);
  assert.equal(result.value.nodes[0].sideEffect, "none");
  assert.equal(result.value.nodes[2].sideEffect, "approval_marker");
});

test("rejects unknown root fields and model-selected node types", () => {
  const extra = validDraft();
  extra.execute = true;
  assert.equal(validateWorkflowDraft(extra).error, "invalid_workflow_shape");

  const unknown = validDraft();
  unknown.nodes[1].type = "http.request";
  assert.equal(validateWorkflowDraft(unknown).error, "unknown_node_type");
});

test("rejects arbitrary executable or credential-bearing config", () => {
  const shell = validDraft();
  shell.nodes[1].config = { fields: ["customerId"], command: "rm -rf /" };
  assert.equal(validateWorkflowDraft(shell).error, "invalid_node_config");

  for (const field of [
    "api_key", "refresh_token", "password_hash", "private_key",
    "apiKey", "accessToken", "refreshToken", "passwordHash", "privateKey", "clientSecret",
  ]) {
    const secret = validDraft();
    secret.nodes[1].config = { fields: [field] };
    assert.equal(validateWorkflowDraft(secret).error, "invalid_node_config");
  }
});

test("rejects duplicate IDs, unknown endpoints, duplicate edges and self-loops", () => {
  const duplicate = validDraft();
  duplicate.nodes[1].id = "start";
  assert.equal(validateWorkflowDraft(duplicate).error, "duplicate_node_id");

  const missing = validDraft();
  missing.edges[0].to = "missing";
  assert.equal(validateWorkflowDraft(missing).error, "edge_endpoint_not_found");

  const self = validDraft();
  self.edges[0] = { from: "project", to: "project" };
  assert.equal(validateWorkflowDraft(self).error, "self_loop_not_allowed");

  const repeated = validDraft();
  repeated.edges.push({ from: "start", to: "project" });
  assert.equal(validateWorkflowDraft(repeated).error, "duplicate_edge");
});

test("rejects cycles, disconnected nodes and nodes that cannot reach preview", () => {
  const cycle = validDraft();
  cycle.edges.push({ from: "review", to: "project" });
  assert.equal(validateWorkflowDraft(cycle).error, "workflow_cycle_not_allowed");

  const disconnected = validDraft();
  disconnected.nodes.push({ id: "orphan", type: "data.select_fields", config: { fields: ["name"] } });
  assert.equal(validateWorkflowDraft(disconnected).error, "unreachable_node");

  const deadEnd = validDraft();
  deadEnd.edges = deadEnd.edges.filter((edge) => edge.from !== "review");
  deadEnd.edges.push({ from: "project", to: "preview" });
  assert.equal(validateWorkflowDraft(deadEnd).error, "node_cannot_reach_preview_output");
});

test("requires exactly one manual trigger and one preview output", () => {
  const noTrigger = validDraft();
  noTrigger.nodes[0].type = "data.select_fields";
  noTrigger.nodes[0].config = { fields: ["id"] };
  assert.equal(validateWorkflowDraft(noTrigger).error, "workflow_requires_one_manual_trigger");

  const twoOutputs = validDraft();
  twoOutputs.nodes.push({ id: "preview2", type: "output.preview", config: { label: "Second" } });
  twoOutputs.edges.push({ from: "preview", to: "preview2" });
  assert.equal(validateWorkflowDraft(twoOutputs).error, "workflow_requires_one_preview_output");
});

test("rejects unsafe graph sizes, invalid node config and non-object inputs", () => {
  assert.equal(validateWorkflowDraft(null).error, "invalid_workflow_shape");
  const badConfig = validDraft();
  badConfig.nodes[2].config.reason = "short";
  assert.equal(validateWorkflowDraft(badConfig).error, "invalid_node_config");

  const tooMany = validDraft();
  tooMany.nodes = Array.from({ length: 31 }, (_, i) => ({
    id: "node_" + i,
    type: i === 0 ? "trigger.manual" : i === 30 ? "output.preview" : "data.select_fields",
    config: i === 0 ? {} : i === 30 ? { label: "Done" } : { fields: ["id"] },
  }));
  tooMany.edges = tooMany.nodes.slice(1).map((node, i) => ({ from: "node_" + i, to: node.id }));
  assert.equal(validateWorkflowDraft(tooMany).error, "invalid_node_count");
});


import { simulateWorkflowDraft } from "./workflow-contract.js";

test("simulates a valid draft deterministically without execution or persistence", () => {
  const draft = validDraft();
  const sample = { customerId: "cust-001", email: "person@example.test", ignored: "not selected" };
  const first = simulateWorkflowDraft(draft, sample);
  const second = simulateWorkflowDraft(draft, sample);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.value.simulationMode, "in_memory_preview_only");
  assert.deepEqual(first.value.preview, {
    label: "Onboarding preview",
    data: { customerId: "cust-001", email: "person@example.test" },
    approvalRequired: true,
  });
  assert.deepEqual(first.value.trace.map((step) => step.kind), [
    "manual_trigger", "field_projection", "review_marker", "preview_output",
  ]);
  assert.equal(first.value.executionEnabled, false);
  assert.equal(first.value.persistenceEnabled, false);
  assert.equal(first.value.externalEffectsAllowed, false);
  assert.equal(first.value.brokerWritesAllowed, false);
  assert.equal(first.value.liveTradingEnabled, false);
});

test("simulator accepts canonical normalized drafts and rejects altered safety metadata", () => {
  const normalized = validateWorkflowDraft(validDraft()).value;
  const accepted = simulateWorkflowDraft(normalized, { customerId: "normalized-001" });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.preview.data.customerId, "normalized-001");
  assert.equal(accepted.value.executionEnabled, false);
  assert.equal(accepted.value.persistenceEnabled, false);
  assert.equal(accepted.value.brokerWritesAllowed, false);
  assert.equal(accepted.value.liveTradingEnabled, false);

  const elevated = structuredClone(normalized);
  elevated.liveTradingEnabled = true;
  assert.equal(simulateWorkflowDraft(elevated).error, "invalid_workflow_envelope");

  const forgedMetadata = structuredClone(normalized);
  forgedMetadata.nodes[0].sideEffect = "broker_write";
  assert.equal(simulateWorkflowDraft(forgedMetadata).error, "invalid_workflow_envelope");
});

test("simulator rejects invalid drafts and unsafe or oversized sample data", () => {
  const invalid = validDraft();
  invalid.nodes[1].type = "http.request";
  assert.equal(simulateWorkflowDraft(invalid).error, "invalid_workflow_draft");

  for (const sample of [
    { accessToken: "should-not-enter-preview" },
    { private_key: "should-not-enter-preview" },
    { amount: { nested: true } },
    { amount: ["not", "scalar"] },
  ]) {
    assert.equal(simulateWorkflowDraft(validDraft(), sample).error, "invalid_simulation_data");
  }
  assert.equal(simulateWorkflowDraft(validDraft(), Object.fromEntries(
    Array.from({ length: 51 }, (_, index) => ["field" + index, index]),
  )).error, "invalid_simulation_data");
  const largeSample = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => ["field" + index, "x".repeat(500)]),
  );
  assert.equal(simulateWorkflowDraft(validDraft(), largeSample).error, "simulation_data_too_large");
});

test("simulator never invents approval or data and handles missing projected fields", () => {
  const draft = validDraft();
  draft.nodes = draft.nodes.filter((node) => node.type !== "gate.review_required");
  draft.edges = [
    { from: "start", to: "project" },
    { from: "project", to: "preview" },
  ];
  const result = simulateWorkflowDraft(draft, { customerId: "cust-002" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.preview.data, { customerId: "cust-002" });
  assert.equal(result.value.preview.approvalRequired, false);
});
