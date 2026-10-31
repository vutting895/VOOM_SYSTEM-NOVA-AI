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

  const secret = validDraft();
  secret.nodes[1].config = { fields: ["api_key"] };
  assert.equal(validateWorkflowDraft(secret).ok, true); // field names are selectors, never values or credentials
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
  cycle.edges.push({ from: "preview", to: "project" });
  assert.equal(validateWorkflowDraft(cycle).error, "preview_output_must_be_terminal");

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
