import test from "node:test";
import assert from "node:assert/strict";
import {
  isAgentApprovalRoute,
  isUuid,
  normalizeStrategyDraftProposal,
  normalizeApprovalDecision
} from "../agent-approval.js";

const valid = {
  title: "XAUUSD research",
  summary: "Review the proposed setup only",
  market: "XAU/USD",
  timeframe: "15m",
  riskProfile: "low"
};

test("approval routes are exact and bounded", () => {
  assert.equal(isAgentApprovalRoute("/v1/agent/threads"), true);
  assert.equal(isAgentApprovalRoute("/v1/agent/threads/123/approvals"), true);
  assert.equal(isAgentApprovalRoute("/v1/agent/approvals/123/decision"), true);
  assert.equal(isAgentApprovalRoute("/v1/agent/threads/123/approvals/extra"), false);
  assert.equal(isAgentApprovalRoute("/v1/agent/orders"), false);
});

test("UUID validator rejects malformed identifiers", () => {
  assert.equal(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
  assert.equal(isUuid("../threads"), false);
});

test("strategy proposal accepts only the fixed research schema", () => {
  assert.deepEqual(normalizeStrategyDraftProposal(valid), valid);
  assert.throws(() => normalizeStrategyDraftProposal({ ...valid, side: "buy" }), /fields_invalid/);
  assert.throws(() => normalizeStrategyDraftProposal({ ...valid, market: "XAUUSDm" }), /market_invalid/);
});

test("approval decisions reject extra fields and require an edited proposal", () => {
  assert.deepEqual(normalizeApprovalDecision({ decision: "approve" }), {
    decision: "approve", note: null, editedProposal: null
  });
  assert.throws(() => normalizeApprovalDecision({ decision: "edit" }), /edited_proposal_required/);
  assert.throws(() => normalizeApprovalDecision({ decision: "approve", order: true }), /fields_invalid/);
  assert.equal(normalizeApprovalDecision({ decision: "edit", editedProposal: valid }).editedProposal.title, valid.title);
});
