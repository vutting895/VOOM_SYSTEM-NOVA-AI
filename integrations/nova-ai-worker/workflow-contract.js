export const WORKFLOW_SCHEMA_VERSION = "nova.workflow.v1";

export const WORKFLOW_LIMITS = Object.freeze({
  maxNodes: 30,
  maxEdges: 60,
  maxFanOut: 5,
  maxFanIn: 5,
  maxFieldsPerProjection: 20,
});

const NODE_TYPES = Object.freeze({
  "trigger.manual": Object.freeze({
    sideEffect: "none",
    validate(config) {
      return exactKeys(config, []) ? null : "invalid_node_config";
    },
  }),
  "data.select_fields": Object.freeze({
    sideEffect: "none",
    validate(config) {
      if (!exactKeys(config, ["fields"]) || !Array.isArray(config.fields)) return "invalid_node_config";
      if (
        config.fields.length < 1 ||
        config.fields.length > WORKFLOW_LIMITS.maxFieldsPerProjection ||
        config.fields.some((field) =>
          typeof field !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) ||
          /(?:^|_)(?:api_?key|secret|token|password|credential|authorization|private_?key)(?:_|$)/i.test(field)
        ) ||
        new Set(config.fields).size !== config.fields.length
      ) return "invalid_node_config";
      return null;
    },
  }),
  "gate.review_required": Object.freeze({
    sideEffect: "approval_marker",
    validate(config) {
      if (!exactKeys(config, ["reason"])) return "invalid_node_config";
      if (typeof config.reason !== "string" || config.reason.trim().length < 10 || config.reason.length > 300) {
        return "invalid_node_config";
      }
      return null;
    },
  }),
  "output.preview": Object.freeze({
    sideEffect: "none",
    validate(config) {
      if (!exactKeys(config, ["label"])) return "invalid_node_config";
      if (typeof config.label !== "string" || config.label.trim().length < 1 || config.label.length > 80) {
        return "invalid_node_config";
      }
      return null;
    },
  }),
});

export const WORKFLOW_NODE_TYPES = Object.freeze(Object.keys(NODE_TYPES));

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function boundedString(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function failure(error, details = undefined) {
  return details ? { ok: false, error, details } : { ok: false, error };
}

/**
 * Validate an untrusted, data-only workflow draft.
 *
 * This module deliberately does not execute nodes, resolve credentials, call providers,
 * evaluate expressions, or infer authorization. The node registry is server-owned.
 */
export function validateWorkflowDraft(input) {
  if (!exactKeys(input, ["schemaVersion", "title", "description", "nodes", "edges"])) {
    return failure("invalid_workflow_shape");
  }
  if (input.schemaVersion !== WORKFLOW_SCHEMA_VERSION) return failure("unsupported_workflow_version");
  if (!boundedString(input.title, 1, 120) || !boundedString(input.description, 1, 500)) {
    return failure("invalid_workflow_metadata");
  }
  if (!Array.isArray(input.nodes) || input.nodes.length < 2 || input.nodes.length > WORKFLOW_LIMITS.maxNodes) {
    return failure("invalid_node_count");
  }
  if (!Array.isArray(input.edges) || input.edges.length < 1 || input.edges.length > WORKFLOW_LIMITS.maxEdges) {
    return failure("invalid_edge_count");
  }

  const nodes = new Map();
  const counts = new Map();
  for (const node of input.nodes) {
    if (!exactKeys(node, ["id", "type", "config"])) return failure("invalid_node_shape");
    if (typeof node.id !== "string" || !/^[a-z][a-z0-9_-]{0,47}$/.test(node.id)) {
      return failure("invalid_node_id");
    }
    if (nodes.has(node.id)) return failure("duplicate_node_id");
    if (typeof node.type !== "string" || !Object.hasOwn(NODE_TYPES, node.type)) {
      return failure("unknown_node_type");
    }
    const configError = NODE_TYPES[node.type].validate(node.config);
    if (configError) return failure(configError, { nodeId: node.id });
    nodes.set(node.id, { id: node.id, type: node.type, config: structuredClone(node.config) });
    counts.set(node.id, { incoming: 0, outgoing: 0 });
  }

  const triggers = [...nodes.values()].filter((node) => node.type === "trigger.manual");
  const outputs = [...nodes.values()].filter((node) => node.type === "output.preview");
  if (triggers.length !== 1) return failure("workflow_requires_one_manual_trigger");
  if (outputs.length !== 1) return failure("workflow_requires_one_preview_output");

  const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
  const reverse = new Map([...nodes.keys()].map((id) => [id, []]));
  const seenEdges = new Set();

  for (const edge of input.edges) {
    if (!exactKeys(edge, ["from", "to"])) return failure("invalid_edge_shape");
    if (typeof edge.from !== "string" || typeof edge.to !== "string" || !nodes.has(edge.from) || !nodes.has(edge.to)) {
      return failure("edge_endpoint_not_found");
    }
    if (edge.from === edge.to) return failure("self_loop_not_allowed");
    const key = edge.from + "\u0000" + edge.to;
    if (seenEdges.has(key)) return failure("duplicate_edge");
    seenEdges.add(key);
    adjacency.get(edge.from).push(edge.to);
    reverse.get(edge.to).push(edge.from);
    counts.get(edge.from).outgoing += 1;
    counts.get(edge.to).incoming += 1;
  }

  for (const [id, count] of counts) {
    if (count.outgoing > WORKFLOW_LIMITS.maxFanOut || count.incoming > WORKFLOW_LIMITS.maxFanIn) {
      return failure("graph_degree_limit_exceeded", { nodeId: id });
    }
  }

  const triggerId = triggers[0].id;
  const outputId = outputs[0].id;
  if (counts.get(triggerId).incoming !== 0) return failure("trigger_must_be_graph_root");
  if (counts.get(outputId).outgoing !== 0) return failure("preview_output_must_be_terminal");

  // Kahn's algorithm rejects all cycles without evaluating user-provided expressions.
  const indegree = new Map([...counts].map(([id, count]) => [id, count.incoming]));
  const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (ready.length) {
    const id = ready.shift();
    visited += 1;
    for (const next of adjacency.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (visited !== nodes.size) return failure("workflow_cycle_not_allowed");

  const walk = (graph, start) => {
    const reached = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      for (const next of graph.get(current)) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    return reached;
  };
  const fromTrigger = walk(adjacency, triggerId);
  if (fromTrigger.size !== nodes.size) return failure("unreachable_node");
  const toOutput = walk(reverse, outputId);
  if (toOutput.size !== nodes.size) return failure("node_cannot_reach_preview_output");

  const normalizedNodes = [...nodes.values()].map((node) => ({
    id: node.id,
    type: node.type,
    config: node.config,
    sideEffect: NODE_TYPES[node.type].sideEffect,
  }));

  return {
    ok: true,
    value: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      title: input.title.trim(),
      description: input.description.trim(),
      nodes: normalizedNodes,
      edges: input.edges.map(({ from, to }) => ({ from, to })),
      executionMode: "draft_only",
      externalEffectsAllowed: false,
      brokerWritesAllowed: false,
      liveTradingEnabled: false,
    },
  };
}
