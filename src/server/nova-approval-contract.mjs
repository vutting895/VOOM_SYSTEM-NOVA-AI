import { createHash } from "node:crypto";

export const NOVA_APPROVAL_POLICY_VERSION = "nova-approval.v1";
export const NOVA_APPROVAL_REQUEST_TYPE = "strategy_draft_review";

const PROPOSAL_KEYS = ["title", "summary", "market", "timeframe", "riskProfile"];
const ALLOWED_MARKETS = new Set(["BTC/USDT", "ETH/USDT", "EUR/USD", "XAU/USD", "US30"]);
const ALLOWED_TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d"]);
const ALLOWED_RISK_PROFILES = new Set(["low", "medium", "high"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function assertPlainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(code);
  }
}

export function normalizeStrategyDraftProposal(input) {
  assertPlainObject(input, "proposal_must_be_an_object");
  const keys = Object.keys(input).sort();
  const expected = [...PROPOSAL_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("proposal_unknown_or_missing_fields");
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!title || title.length > 120) throw new TypeError("title_invalid");
  if (!summary || summary.length > 600) throw new TypeError("summary_invalid");

  const market = input.market;
  const timeframe = input.timeframe;
  const riskProfile = input.riskProfile;
  if (market !== null && !ALLOWED_MARKETS.has(market)) throw new TypeError("market_invalid");
  if (timeframe !== null && !ALLOWED_TIMEFRAMES.has(timeframe)) throw new TypeError("timeframe_invalid");
  if (riskProfile !== null && !ALLOWED_RISK_PROFILES.has(riskProfile)) throw new TypeError("risk_profile_invalid");

  return { title, summary, market, timeframe, riskProfile };
}

export function hashStrategyDraftProposal(proposal) {
  const normalized = normalizeStrategyDraftProposal(proposal);
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

export function normalizeApprovalDecision(input) {
  assertPlainObject(input, "decision_must_be_an_object");
  const keys = Object.keys(input);
  const allowed = new Set(["decision", "note", "editedProposal"]);
  if (keys.some((key) => !allowed.has(key))) throw new TypeError("decision_unknown_fields");

  const decision = input.decision;
  if (!["approve", "reject", "edit"].includes(decision)) throw new TypeError("decision_invalid");

  let note = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") throw new TypeError("note_invalid");
    note = input.note.trim() || null;
    if (note && note.length > 300) throw new TypeError("note_invalid");
  }

  let editedProposal = null;
  if (decision === "edit") {
    editedProposal = normalizeStrategyDraftProposal(input.editedProposal);
  } else if (input.editedProposal !== undefined) {
    throw new TypeError("payload_not_allowed");
  }

  return { decision, note, editedProposal };
}
