import test from "node:test";
import assert from "node:assert/strict";
import {
  NOVA_APPROVAL_POLICY_VERSION,
  NOVA_APPROVAL_REQUEST_TYPE,
  hashStrategyDraftProposal,
  isUuid,
  normalizeApprovalDecision,
  normalizeStrategyDraftProposal,
} from "../frontend/lib/agent-approval-contract.mjs";

const validProposal = () => ({
  title: "NOVA EMA/RSI research draft",
  summary: "Research only. Not backtested and not executable.",
  market: "XAU/USD",
  timeframe: "15m",
  riskProfile: "low",
});

test("normalizes only the safe strategy-review proposal shape", () => {
  const normalized = normalizeStrategyDraftProposal({ ...validProposal(), title: "  Draft  " });
  assert.deepEqual(normalized, {
    title: "Draft",
    summary: "Research only. Not backtested and not executable.",
    market: "XAU/USD",
    timeframe: "15m",
    riskProfile: "low",
  });
  assert.equal(NOVA_APPROVAL_POLICY_VERSION, "nova-approval.v1");
  assert.equal(NOVA_APPROVAL_REQUEST_TYPE, "strategy_draft_review");
});

test("proposal hash is stable and changes when the reviewed payload changes", () => {
  const proposal = validProposal();
  assert.equal(hashStrategyDraftProposal(proposal), hashStrategyDraftProposal({ ...proposal }));
  assert.notEqual(hashStrategyDraftProposal(proposal), hashStrategyDraftProposal({ ...proposal, riskProfile: "medium" }));
  assert.match(hashStrategyDraftProposal(proposal), /^[a-f0-9]{64}$/);
});

test("rejects executable order fields and unregistered proposal values", () => {
  assert.throws(() => normalizeStrategyDraftProposal({ ...validProposal(), volume: 1 }), /unknown_fields/);
  assert.throws(() => normalizeStrategyDraftProposal({ ...validProposal(), broker: "MT5" }), /unknown_fields/);
  assert.throws(() => normalizeStrategyDraftProposal({ ...validProposal(), market: "foreign-user-account" }), /market_invalid/);
  assert.throws(() => normalizeStrategyDraftProposal({ ...validProposal(), summary: "x".repeat(601) }), /summary_invalid/);
});

test("validates approve, reject and edit decisions with strict fields", () => {
  assert.deepEqual(normalizeApprovalDecision({ decision: "approve" }), {
    decision: "approve", note: null, editedProposal: null,
  });
  assert.deepEqual(normalizeApprovalDecision({ decision: "reject", note: "  not ready  " }), {
    decision: "reject", note: "not ready", editedProposal: null,
  });
  const edited = normalizeApprovalDecision({
    decision: "edit",
    editedProposal: { ...validProposal(), summary: "Revised for research" },
  });
  assert.equal(edited.decision, "edit");
  assert.equal(edited.editedProposal.summary, "Revised for research");
});

test("rejects extra decision fields, oversize note and an edit without a valid replacement", () => {
  assert.throws(() => normalizeApprovalDecision({ decision: "approve", volume: 1 }), /unknown_fields/);
  assert.throws(() => normalizeApprovalDecision({ decision: "approve", note: "x".repeat(301) }), /note_invalid/);
  assert.throws(() => normalizeApprovalDecision({ decision: "edit" }), /proposal_must_be_an_object/);
  assert.throws(() => normalizeApprovalDecision({ decision: "approve", editedProposal: validProposal() }), /payload_not_allowed/);
});

test("accepts UUID-shaped identifiers and rejects untrusted arbitrary identifiers", () => {
  assert.equal(isUuid("2f5b1012-8170-4f4d-8f4e-7e5721ef1000"), true);
  assert.equal(isUuid("foreign-user-account"), false);
  assert.equal(isUuid(""), false);
});

test("server-authoritative expiry probe carries no decision payload", () => {
  assert.deepEqual(normalizeApprovalDecision({ decision: "expire" }), {
    decision: "expire", note: null, editedProposal: null,
  });
  assert.throws(
    () => normalizeApprovalDecision({ decision: "expire", note: "not an expiry probe" }),
    /expiration_payload_not_allowed/,
  );
  assert.throws(
    () => normalizeApprovalDecision({ decision: "expire", editedProposal: validProposal() }),
    /expiration_payload_not_allowed/,
  );
});
