import { createHmac } from "node:crypto";

export const NOVA_LANGGRAPH_CHECKPOINT_SCHEMA = "nova_langgraph_private";
export const NOVA_LANGGRAPH_CHECKPOINT_NAMESPACE = "approval_review";
const RESUMABLE_STATUSES = new Set(["approved", "rejected", "edited", "expired"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkpointError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function deriveCheckpointThreadId({ userId, appThreadId, approvalId, secret }) {
  for (const [label, value] of [["userId", userId], ["appThreadId", appThreadId], ["approvalId", approvalId]]) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      throw checkpointError("NOVA_LANGGRAPH_ID_INVALID", label + " must be a UUID");
    }
  }
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw checkpointError("NOVA_LANGGRAPH_SECRET_INVALID", "NOVA_LANGGRAPH_THREAD_ID_SECRET must contain at least 32 UTF-8 bytes");
  }

  // Never pass a caller-supplied or raw tenant ID to the checkpointer.
  return createHmac("sha256", secret)
    .update([userId.toLowerCase(), appThreadId.toLowerCase(), approvalId.toLowerCase()].join(":"), "utf8")
    .digest("hex");
}

export function normalizeCheckpointDecision(input, expected) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_INVALID", "Resume payload must be an object");
  }
  const allowedKeys = new Set(["approvalId", "proposalHash", "status", "note"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_FIELDS_INVALID", "Resume payload contains unsupported fields");
  }
  if (input.approvalId !== expected.approvalId || input.proposalHash !== expected.proposalHash) {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_MISMATCH", "Resume payload does not match the checkpointed approval");
  }
  if (!RESUMABLE_STATUSES.has(input.status)) {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_STATUS_INVALID", "Only terminal review statuses can resume an approval graph");
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_NOTE_INVALID", "Review note must be a string");
  }
  const note = input.note == null ? null : input.note.trim() || null;
  if (note && note.length > 300) {
    throw checkpointError("NOVA_LANGGRAPH_RESUME_NOTE_INVALID", "Review note exceeds 300 characters");
  }

  return {
    approvalId: expected.approvalId,
    proposalHash: expected.proposalHash,
    status: input.status,
    note,
  };
}

function hasPendingInterrupt(snapshot) {
  return Boolean(snapshot?.tasks?.some((task) => Array.isArray(task.interrupts) && task.interrupts.length > 0));
}

function snapshotView(snapshot) {
  const values = snapshot?.values || {};
  return {
    status: hasPendingInterrupt(snapshot) ? "awaiting_review" : values.reviewStatus ? "resumed" : "not_started",
    approvalId: values.approvalId || null,
    proposalHash: values.proposalHash || null,
    reviewStatus: values.reviewStatus || null,
  };
}

async function loadDependencies() {
  const [langgraph, postgres] = await Promise.all([
    import("@langchain/langgraph"),
    import("@langchain/langgraph-checkpoint-postgres"),
  ]);
  return { ...langgraph, ...postgres };
}

export async function createNovaApprovalCheckpointRuntime({
  env = process.env,
  dependenciesLoader = loadDependencies,
} = {}) {
  if (env.NOVA_LANGGRAPH_ENABLED !== "true") {
    throw checkpointError("NOVA_LANGGRAPH_DISABLED", "LangGraph checkpoint integration is disabled");
  }
  const connectionString = env.NOVA_LANGGRAPH_DATABASE_URL;
  let parsedConnectionUrl;
  try {
    parsedConnectionUrl = new URL(connectionString);
  } catch {
    throw checkpointError("NOVA_LANGGRAPH_DATABASE_URL_INVALID", "NOVA_LANGGRAPH_DATABASE_URL must be a PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedConnectionUrl.protocol) || !parsedConnectionUrl.hostname) {
    throw checkpointError("NOVA_LANGGRAPH_DATABASE_URL_INVALID", "NOVA_LANGGRAPH_DATABASE_URL must use postgres:// or postgresql:// and include a host");
  }

  const secret = env.NOVA_LANGGRAPH_THREAD_ID_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw checkpointError("NOVA_LANGGRAPH_SECRET_INVALID", "A stable 32-byte thread ID HMAC secret is required");
  }

  let deps;
  try {
    deps = await dependenciesLoader();
  } catch {
    throw checkpointError("NOVA_LANGGRAPH_DEPENDENCIES_MISSING", "Install the pinned LangGraph and PostgreSQL checkpointer dependencies and regenerate bun.lock before enabling this feature");
  }

  const { Annotation, StateGraph, START, END, interrupt, Command, PostgresSaver } = deps;
  if (!Annotation?.Root || !StateGraph || START === undefined || END === undefined ||
      typeof interrupt !== "function" || typeof Command !== "function" ||
      typeof PostgresSaver?.fromConnString !== "function") {
    throw checkpointError("NOVA_LANGGRAPH_API_INCOMPATIBLE", "Installed LangGraph packages do not expose the required checkpoint API");
  }

  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: NOVA_LANGGRAPH_CHECKPOINT_SCHEMA,
  });
  try {
    await checkpointer.setup();
  } catch (error) {
    if (typeof checkpointer.end === "function") {
      await checkpointer.end().catch(() => {});
    }
    throw checkpointError(
      "NOVA_LANGGRAPH_CHECKPOINT_SETUP_FAILED",
      error instanceof Error ? "PostgreSQL checkpoint setup failed: " + error.message : "PostgreSQL checkpoint setup failed",
    );
  }

  const State = Annotation.Root({
    approvalId: Annotation({ reducer: (_previous, next) => next, default: () => null }),
    proposalHash: Annotation({ reducer: (_previous, next) => next, default: () => null }),
    reviewStatus: Annotation({ reducer: (_previous, next) => next, default: () => null }),
    decisionNote: Annotation({ reducer: (_previous, next) => next, default: () => null }),
  });

  const reviewGraph = new StateGraph(State)
    .addNode("await_human_review", async (state) => {
      const answer = interrupt({
        type: "nova_strategy_draft_review",
        approvalId: state.approvalId,
        proposalHash: state.proposalHash,
        allowedStatuses: ["approved", "rejected", "edited", "expired"],
        brokerExecution: false,
      });
      const decision = normalizeCheckpointDecision(answer, {
        approvalId: state.approvalId,
        proposalHash: state.proposalHash,
      });
      return {
        reviewStatus: decision.status,
        decisionNote: decision.note,
      };
    })
    .addEdge(START, "await_human_review")
    .addEdge("await_human_review", END)
    .compile({ checkpointer });

  function makeConfig(identity) {
    return {
      configurable: {
        thread_id: deriveCheckpointThreadId({ ...identity, secret }),
        checkpoint_ns: NOVA_LANGGRAPH_CHECKPOINT_NAMESPACE,
      },
    };
  }

  async function startReview(identity) {
    const config = makeConfig(identity);
    const existing = await reviewGraph.getState(config);
    const current = snapshotView(existing);
    if (current.approvalId) {
      if (current.approvalId !== identity.approvalId) {
        throw checkpointError("NOVA_LANGGRAPH_CHECKPOINT_COLLISION", "Checkpoint belongs to another approval");
      }
      if (current.proposalHash !== identity.proposalHash) {
        throw checkpointError("NOVA_LANGGRAPH_CHECKPOINT_MISMATCH", "Checkpoint proposal hash differs from the immutable Approval record");
      }
      if (current.status === "awaiting_review" || current.status === "resumed") return current;
      throw checkpointError("NOVA_LANGGRAPH_CHECKPOINT_STATE_INVALID", "Existing checkpoint is neither waiting for review nor complete");
    }

    await reviewGraph.invoke({
      approvalId: identity.approvalId,
      proposalHash: identity.proposalHash,
      reviewStatus: null,
      decisionNote: null,
    }, config);

    return snapshotView(await reviewGraph.getState(config));
  }

  async function deleteReviewCheckpoint(identity) {
    const config = makeConfig(identity);
    const threadId = config.configurable.thread_id;
    if (typeof checkpointer.deleteThread !== "function") {
      throw checkpointError("NOVA_LANGGRAPH_DELETE_UNSUPPORTED", "Installed checkpointer does not support thread deletion");
    }
    const existing = await reviewGraph.getState(config);
    if (existing?.values?.approvalId &&
        (existing.values.approvalId !== identity.approvalId ||
         existing.values.proposalHash !== identity.proposalHash)) {
      throw checkpointError("NOVA_LANGGRAPH_CHECKPOINT_MISMATCH", "Refusing to erase a checkpoint that does not match the owned Approval identity");
    }
    await checkpointer.deleteThread(threadId);
    return { status: "deleted" };
  }

  async function resumeReview(identity, input) {
    const config = makeConfig(identity);
    let existing = await reviewGraph.getState(config);

    if (!existing?.values?.approvalId) {
      await startReview(identity);
      existing = await reviewGraph.getState(config);
    }

    if (existing.values?.approvalId !== identity.approvalId ||
        existing.values?.proposalHash !== identity.proposalHash) {
      throw checkpointError("NOVA_LANGGRAPH_CHECKPOINT_MISMATCH", "Checkpoint identity does not match the owned Approval record");
    }

    const decision = normalizeCheckpointDecision(input, {
      approvalId: identity.approvalId,
      proposalHash: identity.proposalHash,
    });

    if (!hasPendingInterrupt(existing)) {
      const current = snapshotView(existing);
      if (current.reviewStatus === decision.status) return { ...current, idempotent: true };
      throw checkpointError("NOVA_LANGGRAPH_NOT_WAITING", "Approval graph is not waiting for a human review decision");
    }

    await reviewGraph.invoke(new Command({ resume: decision }), config);
    return snapshotView(await reviewGraph.getState(config));
  }

  return {
    startReview,
    resumeReview,
    deleteReviewCheckpoint,
    async close() {
      if (typeof checkpointer.end === "function") await checkpointer.end();
    },
  };
}
