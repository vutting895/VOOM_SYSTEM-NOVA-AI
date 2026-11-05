const NODE_DEFINITIONS = Object.freeze([
  { id: "validate_brief", type: "validation", dependsOn: [], status: "completed" },
  { id: "video_director", type: "planning", dependsOn: ["validate_brief"], status: "completed" },
  { id: "media_ingest", type: "media_ingest", dependsOn: ["video_director"], status: "blocked_worker_unavailable" },
  { id: "generation", type: "generation", dependsOn: ["video_director"], status: "blocked_no_free_gpu" },
  { id: "assembly", type: "assembly", dependsOn: ["media_ingest", "generation"], status: "blocked_worker_unavailable" },
  { id: "quality_check", type: "quality_check", dependsOn: ["assembly"], status: "blocked_worker_unavailable" },
  { id: "export", type: "export", dependsOn: ["quality_check"], status: "blocked_worker_unavailable" },
]);

function assertAcyclic(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) throw new Error("workflow graph contains a cycle");
    if (visited.has(id)) return;
    const node = byId.get(id);
    if (!node) throw new Error(`workflow dependency does not exist: ${id}`);
    visiting.add(id);
    for (const dependency of node.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }

  for (const node of nodes) visit(node.id);
}

/**
 * Produces an inspectable DAG only. It never dispatches workers or invokes models.
 * Generation and media processing stay blocked until zero-cost compute and an isolated
 * CPU worker are independently qualified.
 */
export function planVideoWorkflow(direction) {
  if (!direction || direction.engine !== "NOVA Video Director" || !Array.isArray(direction.scenes) || direction.scenes.length === 0) {
    throw new TypeError("a valid NOVA Video Director result is required");
  }

  const nodes = NODE_DEFINITIONS.map((node) => ({
    ...node,
    dependsOn: [...node.dependsOn],
    status: node.id === "video_director" ? "completed" : node.status,
  }));
  assertAcyclic(nodes);

  return {
    workflow: "nova-video-cpu-first",
    workflowVersion: "0.1.0",
    directionVersion: direction.engineVersion,
    nodes,
    edges: nodes.flatMap((node) => node.dependsOn.map((dependency) => ({ from: dependency, to: node.id }))),
    state: "blocked",
    blockedReasons: ["blocked_no_free_gpu", "blocked_worker_unavailable"],
    executionEnabled: false,
    estimatedCost: 0,
  };
}
