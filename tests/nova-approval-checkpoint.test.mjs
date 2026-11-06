import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOVA_LANGGRAPH_CHECKPOINT_NAMESPACE,
  NOVA_LANGGRAPH_CHECKPOINT_SCHEMA,
  createNovaApprovalCheckpointRuntime,
  deriveCheckpointThreadId,
  normalizeCheckpointDecision,
} from "../src/server/nova-approval-checkpoint.mjs";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const appThread = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const approval = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const proposalHash = "a".repeat(64);
const secret = "nova-langgraph-thread-id-secret-at-least-32-bytes";

test("checkpoint schema and namespace are separated from public Approval and Audit tables", () => {
  assert.equal(NOVA_LANGGRAPH_CHECKPOINT_SCHEMA, "nova_langgraph_private");
  assert.equal(NOVA_LANGGRAPH_CHECKPOINT_NAMESPACE, "approval_review");
});

test("checkpoint thread IDs are opaque, stable and tenant/approval separated", () => {
  const first = deriveCheckpointThreadId({ userId: userA, appThreadId: appThread, approvalId: approval, secret });
  assert.equal(first.length, 64);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, deriveCheckpointThreadId({ userId: userA, appThreadId: appThread, approvalId: approval, secret }));
  assert.notEqual(first, deriveCheckpointThreadId({ userId: userB, appThreadId: appThread, approvalId: approval, secret }));
  assert.notEqual(first, deriveCheckpointThreadId({ userId: userA, appThreadId: appThread, approvalId: userB, secret }));
  assert.notEqual(first, userA);
  assert.notEqual(first, appThread);
  assert.notEqual(first, approval);
});

test("checkpoint identifiers require UUIDs and a stable high-entropy secret", () => {
  assert.throws(() => deriveCheckpointThreadId({ userId: "user-a", appThreadId: appThread, approvalId: approval, secret }), /userId must be a UUID/);
  assert.throws(() => deriveCheckpointThreadId({ userId: userA, appThreadId: appThread, approvalId: approval, secret: "short" }), /at least 32 UTF-8 bytes/);
});

test("resume accepts only persisted terminal review states bound to the expected approval", () => {
  const expected = { approvalId: approval, proposalHash };
  for (const status of ["approved", "rejected", "edited", "expired"]) {
    assert.deepEqual(
      normalizeCheckpointDecision({ ...expected, status, note: " reviewer note " }, expected),
      { ...expected, status, note: "reviewer note" },
    );
  }
  assert.equal(normalizeCheckpointDecision({ ...expected, status: "rejected" }, expected).note, null);
});

test("resume rejects forged identifiers, unsupported states, fields and oversized notes", () => {
  const expected = { approvalId: approval, proposalHash };
  assert.throws(() => normalizeCheckpointDecision({ approvalId: userB, proposalHash, status: "approved" }, expected), /does not match/);
  assert.throws(() => normalizeCheckpointDecision({ approvalId: approval, proposalHash: "b".repeat(64), status: "approved" }, expected), /does not match/);
  assert.throws(() => normalizeCheckpointDecision({ ...expected, status: "pending" }, expected), /Only terminal review statuses/);
  assert.throws(() => normalizeCheckpointDecision({ ...expected, status: "approved", executeOrder: true }, expected), /unsupported fields/);
  assert.throws(() => normalizeCheckpointDecision({ ...expected, status: "approved", note: "x".repeat(301) }, expected), /300 characters/);
  assert.throws(() => normalizeCheckpointDecision({ ...expected, status: "approved", note: 123 }, expected), /note must be a string/);
});

test("checkpoint runtime uses PostgresSaver setup, a private schema and LangGraph interrupt resume", () => {
  const source = readFileSync(new URL("../src/server/nova-approval-checkpoint.mjs", import.meta.url), "utf8");
  assert.match(source, /PostgresSaver\.fromConnString/);
  assert.match(source, /schema: NOVA_LANGGRAPH_CHECKPOINT_SCHEMA/);
  assert.match(source, /await checkpointer\.setup\(\)/);
  assert.match(source, /interrupt\(/);
  assert.match(source, /new Command\(\{ resume: decision \}\)/);
  assert.match(source, /checkpointer\.deleteThread/);
  assert.doesNotMatch(source, /place_order|execute_broker_order|submit_order|liveTradingEnabled\s*=\s*true/i);
});

test("checkpoint runtime rejects a malformed or non-PostgreSQL database URL before loading packages", async () => {
  await assert.rejects(
    createNovaApprovalCheckpointRuntime({
      env: {
        NOVA_LANGGRAPH_ENABLED: "true",
        NOVA_LANGGRAPH_DATABASE_URL: "https://example.test/db",
        NOVA_LANGGRAPH_THREAD_ID_SECRET: secret,
      },
      dependenciesLoader: async () => {
        throw new Error("must not load dependencies for an invalid connection URL");
      },
    }),
    (error) => error.code === "NOVA_LANGGRAPH_DATABASE_URL_INVALID",
  );
});

test("failed PostgresSaver setup closes its connection pool", async () => {
  let closeCount = 0;
  const dependencies = {
    Annotation: Object.assign((spec) => spec, { Root: (spec) => spec }),
    StateGraph: class {},
    START: "__start__",
    END: "__end__",
    interrupt() {},
    Command: class {},
    PostgresSaver: {
      fromConnString() {
        return {
          async setup() { throw new Error("simulated schema permission denied"); },
          async end() { closeCount += 1; },
        };
      },
    },
  };

  await assert.rejects(
    createNovaApprovalCheckpointRuntime({
      env: {
        NOVA_LANGGRAPH_ENABLED: "true",
        NOVA_LANGGRAPH_DATABASE_URL: "postgresql://checkpointer@127.0.0.1/nova_test",
        NOVA_LANGGRAPH_THREAD_ID_SECRET: secret,
      },
      dependenciesLoader: async () => dependencies,
    }),
    (error) => error.code === "NOVA_LANGGRAPH_CHECKPOINT_SETUP_FAILED",
  );
  assert.equal(closeCount, 1);
});

test("Postgres checkpoint runtime pauses, resumes, is idempotent and supports thread erasure", async () => {
  const checkpointRows = new Map();
  let activeInvocation = null;
  let setupCount = 0;
  let deletedThreadId = null;
  let savedSchema = null;

  const fakeInterrupt = (payload) => {
    if (!activeInvocation) throw new Error("interrupt called outside graph invocation");
    if (activeInvocation.resume !== undefined) return activeInvocation.resume;
    activeInvocation.payload = payload;
    const error = new Error("interrupt");
    error.isGraphInterrupt = true;
    throw error;
  };

  class FakeCommand {
    constructor(input) {
      this.resume = input.resume;
    }
  }

  class FakeStateGraph {
    addNode(_name, handler) {
      this.handler = handler;
      return this;
    }
    addEdge() {
      return this;
    }
    compile({ checkpointer }) {
      assert.equal(checkpointer.setupCount, 1);
      const handler = this.handler;
      return {
        async getState(config) {
          return checkpointRows.get(config.configurable.thread_id) || { values: {}, tasks: [] };
        },
        async invoke(input, config) {
          const key = config.configurable.thread_id;
          const isResume = input instanceof FakeCommand;
          const base = isResume ? checkpointRows.get(key).values : input;
          activeInvocation = { resume: isResume ? input.resume : undefined, payload: null };
          try {
            const patch = await handler(base);
            const values = { ...base, ...patch };
            checkpointRows.set(key, { values, tasks: [] });
            return values;
          } catch (error) {
            if (!error.isGraphInterrupt) throw error;
            checkpointRows.set(key, {
              values: base,
              tasks: [{ interrupts: [{ value: activeInvocation.payload }] }],
            });
            return { __interrupt__: [{ value: activeInvocation.payload }] };
          } finally {
            activeInvocation = null;
          }
        },
      };
    }
  }

  const saver = {
    setupCount: 0,
    async setup() { this.setupCount += 1; setupCount += 1; },
    async deleteThread(threadId) { deletedThreadId = threadId; checkpointRows.delete(threadId); },
    async end() {},
  };

  const dependencies = {
    Annotation: Object.assign((spec) => spec, { Root: (spec) => spec }),
    StateGraph: FakeStateGraph,
    START: "__start__",
    END: "__end__",
    interrupt: fakeInterrupt,
    Command: FakeCommand,
    PostgresSaver: {
      fromConnString(_url, options) {
        savedSchema = options.schema;
        return saver;
      },
    },
  };

  const runtime = await createNovaApprovalCheckpointRuntime({
    env: {
      NOVA_LANGGRAPH_ENABLED: "true",
      NOVA_LANGGRAPH_DATABASE_URL: "postgresql://checkpoint:local@127.0.0.1/nova_test",
      NOVA_LANGGRAPH_THREAD_ID_SECRET: secret,
    },
    dependenciesLoader: async () => dependencies,
  });

  const identity = { userId: userA, appThreadId: appThread, approvalId: approval, proposalHash };
  const waiting = await runtime.startReview(identity);
  assert.equal(waiting.status, "awaiting_review");
  await assert.rejects(
    runtime.startReview({ ...identity, proposalHash: "b".repeat(64) }),
    (error) => error.code === "NOVA_LANGGRAPH_CHECKPOINT_MISMATCH",
  );
  await assert.rejects(
    runtime.deleteReviewCheckpoint({ ...identity, proposalHash: "b".repeat(64) }),
    (error) => error.code === "NOVA_LANGGRAPH_CHECKPOINT_MISMATCH",
  );
  assert.equal(savedSchema, NOVA_LANGGRAPH_CHECKPOINT_SCHEMA);
  assert.equal(setupCount, 1);

  const resumed = await runtime.resumeReview(identity, {
    approvalId: approval, proposalHash, status: "approved", note: "Reviewed",
  });
  assert.equal(resumed.status, "resumed");
  assert.equal(resumed.reviewStatus, "approved");

  const duplicate = await runtime.resumeReview(identity, {
    approvalId: approval, proposalHash, status: "approved", note: "Reviewed",
  });
  assert.equal(duplicate.idempotent, true);

  const editedIdentity = {
    ...identity,
    approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  };
  await runtime.startReview(editedIdentity);
  const edited = await runtime.resumeReview(editedIdentity, {
    approvalId: editedIdentity.approvalId,
    proposalHash,
    status: "edited",
    note: null,
  });
  assert.equal(edited.reviewStatus, "edited");
  assert.notEqual(edited.reviewStatus, "approved");

  await runtime.deleteReviewCheckpoint(identity);
  assert.equal(deletedThreadId, deriveCheckpointThreadId({ ...identity, secret }));
  assert.equal(checkpointRows.has(deletedThreadId), false);
  await runtime.close();
});
