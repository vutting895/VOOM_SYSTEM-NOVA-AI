import { createHash } from "node:crypto";

export const NOVA_APPROVAL_POLICY_VERSION = "nova-approval.v1";
export const NOVA_APPROVAL_TTL_MS = 10 * 60 * 1000;
export const NOVA_APPROVAL_REQUEST_TYPE = "strategy_draft_review";

const MARKETS = new Set(["BTC/USDT", "ETH/USDT", "EUR/USD", "XAU/USD", "US30"]);
const TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d"]);
const RISK_PROFILES = new Set(["low", "medium", "high"]);
const PROPOSAL_KEYS = ["title", "summary", "market", "timeframe", "riskProfile"];
const DECISION_KEYS = ["decision", "note", "editedProposal"];

export function normalizeStrategyDraftProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("proposal_must_be_an_object");
  }
  if (Object.keys(value).some((key) => !PROPOSAL_KEYS.includes(key))) {
    throw new TypeError("proposal_contains_unknown_fields");
  }
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const market = value.market ?? null;
  const timeframe = value.timeframe ?? null;
  const riskProfile = value.riskProfile ?? null;

  if (!title || title.length > 120) throw new TypeError("proposal_title_invalid");
  if (!summary || summary.length > 600) throw new TypeError("proposal_summary_invalid");
  if (market !== null && !MARKETS.has(market)) throw new TypeError("proposal_market_invalid");
  if (timeframe !== null && !TIMEFRAMES.has(timeframe)) throw new TypeError("proposal_timeframe_invalid");
  if (riskProfile !== null && !RISK_PROFILES.has(riskProfile)) throw new TypeError("proposal_risk_profile_invalid");

  return { title, summary, market, timeframe, riskProfile };
}

export function hashStrategyDraftProposal(value) {
  const normalized = normalizeStrategyDraftProposal(value);
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

export function normalizeApprovalDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("decision_must_be_an_object");
  }
  if (Object.keys(value).some((key) => !DECISION_KEYS.includes(key))) {
    throw new TypeError("decision_contains_unknown_fields");
  }
  const decision = value.decision;
  if (!["approve", "reject", "edit"].includes(decision)) {
    throw new TypeError("decision_invalid");
  }
  const note = value.note === undefined || value.note === null ? null : value.note;
  if (note !== null && (typeof note !== "string" || note.trim().length > 300)) {
    throw new TypeError("decision_note_invalid");
  }
  if (decision === "edit") {
    return {
      decision,
      note: note?.trim() || null,
      editedProposal: normalizeStrategyDraftProposal(value.editedProposal),
    };
  }
  if (value.editedProposal !== undefined) {
    throw new TypeError("decision_payload_not_allowed");
  }
  return { decision, note: note?.trim() || null, editedProposal: null };
}

export function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
