import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOVA_LANGGRAPH_CHECKPOINT_NAMESPACE,
  NOVA_LANGGRAPH_CHECKPOINT_SCHEMA,
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
