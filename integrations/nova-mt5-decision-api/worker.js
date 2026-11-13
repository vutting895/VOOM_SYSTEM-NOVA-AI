import { EventDedupe } from "./event-dedupe.js";
export { EventDedupe };

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 60;
const MODULE_NAMES = [
  "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
  "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
  "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
  "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep",
  "FootprintLite", "LiquidityPools", "NeuralPilot", "KillZoneBreak",
  "QEX-LiqSweep", "QEX-VolST", "RangeSniper", "SessionBox", "TrendPilot",
  "VolRegime-QEX", "WyckoffPhase",
];
const MODULE_IDS = new Map(MODULE_NAMES.map((name, index) =>
  [name, `M${String(index + 1).padStart(2, "0")}`]));
const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
});
const fail = (error, status) => json({
  ok: false, error, decision: "WAIT",
  ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
}, status);

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function resolveMachineClient(env, keyId) {
  if (typeof keyId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) return null;
  if (typeof env.MT5_M2M_CLIENTS !== "string" || !env.MT5_M2M_CLIENTS) return null;
  let clients;
  try { clients = JSON.parse(env.MT5_M2M_CLIENTS); } catch { return null; }
  if (!clients || typeof clients !== "object" || Array.isArray(clients)) return null;
  const record = clients[keyId];
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  if (typeof record.secret !== "string" || record.secret.length < 32) return null;
  if (typeof record.client_id !== "string" || !/^[A-Za-z0-9._:-]{1,96}$/.test(record.client_id)) return null;
  if (typeof record.tenant_id !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(record.tenant_id)) return null;
  if (typeof record.account_login !== "string" || !/^\d{3,20}$/.test(record.account_login)) return null;
  if (typeof record.broker_server !== "string" || !record.broker_server.trim() || record.broker_server.length > 128) return null;
  return {
    secret: record.secret, clientId: record.client_id, tenantId: record.tenant_id,
    accountLogin: record.account_login, brokerServer: record.broker_server,
  };
}
export async function authenticateMachine(request, rawBody, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const keyId = request.headers.get("X-NOVA-Key-Id") || "";
  const client = resolveMachineClient(env, keyId);
  if (!client) {
    return {
      ok: false,
      status: typeof env.MT5_M2M_CLIENTS === "string" && env.MT5_M2M_CLIENTS ? 401 : 503,
      error: "machine_client_not_configured",
    };
  }
  const timestamp = request.headers.get("X-NOVA-Timestamp") || "";
  const signature = request.headers.get("X-NOVA-Signature") || "";
  const ts = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(ts) ||
      Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "invalid_or_expired_machine_timestamp" };
  }
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, status: 401, error: "invalid_machine_signature" };
  }
  const expected = "sha256=" + await hmacHex(client.secret, timestamp + "." + keyId + "." + rawBody);
  if (!safeEqual(signature.toLowerCase(), expected)) {
    return { ok: false, status: 401, error: "invalid_machine_signature" };
  }
  return { ok: true, keyId, clientId: client.clientId, tenantId: client.tenantId, accountLogin: client.accountLogin, brokerServer: client.brokerServer };
}

export function validateEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schema_version !== "nova.mt5-request.v1") {
    throw Object.assign(new Error("invalid_mt5_request_contract"), { status: 400 });
  }
  const allowedEnvelopeKeys = new Set(["schema_version", "signal_event"]);
  if (Object.hasOwn(value, "risk_snapshot")) {
    throw Object.assign(new Error("controller_risk_snapshot_not_trusted"), { status: 400 });
  }
  if (Object.keys(value).some((key) => !allowedEnvelopeKeys.has(key))) {
    throw Object.assign(new Error("unexpected_mt5_request_field"), { status: 400 });
  }
  const signal = value.signal_event;
  if (!signal || typeof signal !== "object" || Array.isArray(signal) ||
      signal.schema_version !== "mt5ea.signal.v1") {
    throw Object.assign(new Error("invalid_ea_signal_contract"), { status: 400 });
  }
  const allowedSignalKeys = new Set([
    "schema_version", "event_id", "symbol", "timeframe", "account_mode",
    "bar_time_utc", "bid", "ask", "spread_points", "buy_votes", "sell_votes",
    "neutral_votes", "module_votes", "candidate",
  ]);
  if (Object.keys(signal).some((key) => !allowedSignalKeys.has(key))) {
    throw Object.assign(new Error("unexpected_ea_signal_field"), { status: 400 });
  }
  const requiredString = (object, key, max) => {
    const field = object[key];
    if (typeof field !== "string" || !field.trim() || field.length > max) {
      throw Object.assign(new Error("invalid_" + key), { status: 400 });
    }
    return field.trim();
  };
  const eventId = requiredString(signal, "event_id", 128);
  if (eventId.length < 12 || !/^[A-Za-z0-9._:-]+$/.test(eventId)) {
    throw Object.assign(new Error("invalid_event_id"), { status: 400 });
  }
  const symbol = requiredString(signal, "symbol", 32);
  if (!/^[A-Za-z0-9._-]+$/.test(symbol)) {
    throw Object.assign(new Error("invalid_symbol"), { status: 400 });
  }
  const timeframe = requiredString(signal, "timeframe", 12);
  if (!TIMEFRAMES.has(timeframe)) {
    throw Object.assign(new Error("invalid_timeframe"), { status: 400 });
  }
  if (signal.account_mode !== "DEMO") {
    throw Object.assign(new Error("demo_account_required"), { status: 403 });
  }
  const occurredAt = requiredString(signal, "bar_time_utc", 40);
  if (!Number.isFinite(Date.parse(occurredAt)) || !/(Z|\+00:00)$/i.test(occurredAt)) {
    throw Object.assign(new Error("bar_time_utc_must_be_utc"), { status: 400 });
  }
  const numeric = (key, minimum) => {
    const n = signal[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < minimum) {
      throw Object.assign(new Error("invalid_" + key), { status: 400 });
    }
    return n;
  };
  const bid = numeric("bid", Number.MIN_VALUE);
  const ask = numeric("ask", Number.MIN_VALUE);
  const spreadPoints = numeric("spread_points", 0);
  if (ask < bid) throw Object.assign(new Error("ask_must_be_gte_bid"), { status: 422 });

  const candidate = signal.candidate;
  let normalizedCandidate = null;
  if (candidate !== undefined) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
        Object.keys(candidate).sort().join(",") !== "entry_price,side,stop_loss,symbol,volume" ||
        !["BUY", "SELL"].includes(candidate.side) ||
        candidate.symbol !== symbol ||
        ![candidate.volume, candidate.entry_price, candidate.stop_loss].every((n) =>
          typeof n === "number" && Number.isFinite(n) && n > 0)) {
      throw Object.assign(new Error("invalid_trade_candidate"), { status: 422 });
    }
    normalizedCandidate = {
      symbol, side: candidate.side, volume: candidate.volume,
      entry_price: candidate.entry_price, stop_loss: candidate.stop_loss,
    };
  }
  const votes = signal.module_votes;
  if (!Array.isArray(votes) || votes.length !== 30) {
    throw Object.assign(new Error("exactly_30_module_votes_required"), { status: 400 });
  }
  const seen = new Set();
  const normalizedVotes = [];
  const counts = { BUY: 0, SELL: 0, NEUTRAL: 0 };
  for (const item of votes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw Object.assign(new Error("invalid_module_vote"), { status: 400 });
    }
    if (Object.keys(item).some((key) => key !== "name" && key !== "vote")) {
      throw Object.assign(new Error("unexpected_module_vote_field"), { status: 400 });
    }
    const name = requiredString(item, "name", 48);
    const vote = requiredString(item, "vote", 8);
    const moduleId = MODULE_IDS.get(name);
    if (!moduleId || seen.has(name) || !Object.hasOwn(counts, vote)) {
      throw Object.assign(new Error("unknown_duplicate_or_invalid_module_vote"), { status: 400 });
    }
    seen.add(name);
    counts[vote]++;
    normalizedVotes.push({ module_id: moduleId, module_name: name, vote });
  }
  if (seen.size !== 30 || MODULE_NAMES.some((name) => !seen.has(name))) {
    throw Object.assign(new Error("module_inventory_mismatch"), { status: 422 });
  }
  if (signal.buy_votes !== counts.BUY || signal.sell_votes !== counts.SELL ||
      signal.neutral_votes !== counts.NEUTRAL ||
      counts.BUY + counts.SELL + counts.NEUTRAL !== 30) {
    throw Object.assign(new Error("module_vote_totals_mismatch"), { status: 422 });
  }

  const event = {
    schema_version: "nova.mt5-event.v2",
    event_id: eventId,
    client_id: null,
    symbol,
    timeframe,
    occurred_at: occurredAt,
    account_mode: "DEMO",
    vote_counts: { buy: counts.BUY, sell: counts.SELL, neutral: counts.NEUTRAL },
    module_votes: normalizedVotes,
    market_snapshot: { bid, ask, spread_points: spreadPoints },
    candidate: normalizedCandidate,
    risk_snapshot: null,
  };
  if (new TextEncoder().encode(JSON.stringify(event)).byteLength > 32 * 1024) {
    throw Object.assign(new Error("event_payload_too_large"), { status: 413 });
  }
  return event;
}

function resolveBridgeToken(env, tenantId) {
  if (typeof env.MT5_BRIDGE_TOKENS !== "string" || !env.MT5_BRIDGE_TOKENS) return null;
  try {
    const tokens = JSON.parse(env.MT5_BRIDGE_TOKENS);
    const token = tokens?.[tenantId];
    return typeof token === "string" && token.length >= 32 ? token : null;
  } catch { return null; }
}

export async function fetchTrustedBridgeSnapshot(env, client, event) {
  if (!env.MT5_BRIDGE || typeof env.MT5_BRIDGE.fetch !== "function") {
    return { ok: false, status: 503, error: "trusted_mt5_bridge_binding_not_configured" };
  }
  const bridgeToken = resolveBridgeToken(env, client.tenantId);
  if (!bridgeToken) return { ok: false, status: 503, error: "trusted_mt5_bridge_credentials_not_configured" };
  try {
    if (!event.candidate) return { ok: false, status: 422, error: "candidate_trade_plan_required" };
    const candidateQuery = encodeURIComponent(JSON.stringify(event.candidate));
    const response = await env.MT5_BRIDGE.fetch("https://mt5-bridge-relay.internal/api/exposure?candidate=" + candidateQuery, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + bridgeToken,
        "X-VOOM-TENANT-ID": client.tenantId,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, status: 503, error: "trusted_mt5_bridge_unavailable" };
    const snapshot = await response.json();
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
        snapshot.account_login !== client.accountLogin ||
        snapshot.broker_server !== client.brokerServer ||
        typeof snapshot.account_currency !== "string" || !snapshot.account_currency ||
        snapshot.risk_calculation_complete !== true ||
        !Number.isFinite(snapshot.current_equity) || snapshot.current_equity <= 0 ||
        !Number.isFinite(snapshot.aggregate_open_risk_money) || snapshot.aggregate_open_risk_money < 0 ||
        !Number.isInteger(snapshot.open_orders_count) || snapshot.open_orders_count < 0 ||
        typeof snapshot.snapshot_at !== "string" ||
        !Number.isFinite(Date.parse(snapshot.snapshot_at)) ||
        Date.now() - Date.parse(snapshot.snapshot_at) > 60_000 ||
        Date.parse(snapshot.snapshot_at) - Date.now() > 5_000) {
      return { ok: false, status: 503, error: "trusted_mt5_bridge_identity_or_exposure_invalid" };
    }
    const requiredBrokerFields = [
      "broker_day_start_equity", "broker_day_start_at", "broker_day_baseline_available",
      "market_open", "market_data_at", "proposed_entry_risk_money", "candidate_risk_complete",
    ];
    if (!requiredBrokerFields.every((key) => Object.hasOwn(snapshot, key)) ||
        snapshot.broker_day_baseline_available !== true ||
        snapshot.candidate_risk_complete !== true ||
        !Number.isFinite(snapshot.broker_day_start_equity) || snapshot.broker_day_start_equity <= 0 ||
        typeof snapshot.market_open !== "boolean" ||
        !Number.isFinite(Date.parse(snapshot.broker_day_start_at)) ||
        !Number.isFinite(snapshot.broker_day_baseline_capture_delay_seconds) ||
        snapshot.broker_day_baseline_capture_delay_seconds < 0 ||
        snapshot.broker_day_baseline_capture_delay_seconds > 30 ||
        !Number.isFinite(Date.parse(snapshot.market_data_at)) ||
        Date.now() - Date.parse(snapshot.market_data_at) > 60_000 ||
        Date.parse(snapshot.market_data_at) - Date.now() > 5_000 ||
        !Number.isFinite(snapshot.proposed_entry_risk_money) || snapshot.proposed_entry_risk_money < 0 ||
        !snapshot.candidate_risk || snapshot.candidate_risk.complete !== true ||
        !Number.isFinite(snapshot.candidate_risk.risk_money) ||
        snapshot.proposed_entry_risk_money !== snapshot.candidate_risk.risk_money ||
        snapshot.candidate_risk.symbol !== event.candidate.symbol ||
        snapshot.candidate_risk.side !== event.candidate.side ||
        snapshot.candidate_risk.volume !== event.candidate.volume ||
        snapshot.candidate_risk.entry_price !== event.candidate.entry_price ||
        snapshot.candidate_risk.stop_loss !== event.candidate.stop_loss) {
      return { ok: false, status: 503, error: "trusted_mt5_bridge_risk_contract_incomplete" };
    }
    return { ok: true, snapshot: { ...snapshot, tenant_id: client.tenantId } };
  } catch {
    return { ok: false, status: 503, error: "trusted_mt5_bridge_unavailable" };
  }
}

async function dedupeRequest(env, dedupeKey, eventId, operation, claimId, timestamp) {
  const namespace = env.EVENT_DEDUPE;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return { ok: false, status: 503, error: "event_dedupe_service_not_configured" };
  }
  try {
    const stub = namespace.get(namespace.idFromName(dedupeKey));
    const response = await stub.fetch("https://event-dedupe.internal/" + operation, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, claim_id: claimId, timestamp }),
    });
    if (operation === "reserve" && response.status === 409) {
      return { ok: false, status: 409, error: "duplicate_or_in_progress_event" };
    }
    if (!response.ok) return { ok: false, status: 503, error: "event_dedupe_unavailable" };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "event_dedupe_unavailable" };
  }
}
async function callCompute(env, path, body) {
  if (!env.QUANT_ENGINE || typeof env.QUANT_ENGINE.fetch !== "function") {
    return { ok: false, status: 503, error: "quant_engine_adapter_not_configured" };
  }
  const adapterToken = env.QUANT_ADAPTER_M2M_TOKEN;
  if (typeof adapterToken !== "string" || adapterToken.length < 32) {
    return { ok: false, status: 503, error: "quant_adapter_machine_auth_not_configured" };
  }
  try {
    const response = await env.QUANT_ENGINE.fetch("https://nova-quant-engine.internal" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + adapterToken,
        "X-NOVA-Contract": "nova.mt5-decision.v2",
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return {
      ok: false, status: response.status === 422 ? 422 : 502,
      error: path.endsWith("/decision") ? "quant_engine_unavailable_or_rejected" : "risk_gate_unavailable_or_rejected",
    };
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return { ok: false, status: 502, error: "invalid_compute_response" };
    }
    return { ok: true, result };
  } catch {
    return { ok: false, status: 502, error: "compute_service_unavailable" };
  }
}
function validateQuantResult(result, event) {
  if (!result ||
      result.engine !== "MT5HeuristicConsensusAdapter" ||
      result.evaluation_status !== "research_only" ||
      result.execution_enabled !== false ||
      result.event_id !== event.event_id ||
      result.client_id !== event.client_id ||
      result.module_count !== 30 ||
      result.signal_source !== "mt5_ea_heuristic_modules" ||
      !["BUY", "SELL", "NEUTRAL"].includes(result.directional_bias)) return false;

  const counts = result.vote_counts;
  const expected = event.vote_counts;
  if (!counts || !expected ||
      counts.buy !== expected.buy ||
      counts.sell !== expected.sell ||
      counts.neutral !== expected.neutral ||
      counts.buy + counts.sell + counts.neutral !== 30) return false;

  const delta = counts.buy - counts.sell;
  const expectedBias = delta > 0 ? "BUY" : delta < 0 ? "SELL" : "NEUTRAL";
  return result.directional_bias === expectedBias;
}
function validateRiskResult(result, eventId, clientId) {
  if (!result ||
      result.event_id !== eventId ||
      result.client_id !== clientId ||
      typeof result.policy_version !== "string" ||
      typeof result.passed !== "boolean" ||
      !["ELIGIBLE_FOR_RESEARCH_REVIEW", "ENTRY_LOCK_ONLY", "REJECT_NEW_ENTRY"].includes(result.action) ||
      !Array.isArray(result.reason_codes) ||
      result.execution_authorized !== false ||
      result.live_trading_enabled !== false) return false;

  if (result.passed) {
    return result.action === "ELIGIBLE_FOR_RESEARCH_REVIEW" && result.reason_codes.length === 0;
  }
  return result.reason_codes.length > 0 && result.action !== "ELIGIBLE_FOR_RESEARCH_REVIEW";
}
async function explainWithWorkersAI(env, event, quant, risk) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { provider: "none", narrative: null, advisory_only: true };
  }
  try {
    const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        { role: "system", content: "You are a bounded research explainer. Explain only supplied evidence. You are not an authorization system. Never approve, reject, change, bypass, or reinterpret the deterministic Risk Gate. Never claim broker execution. Your text is advisory only and the structured risk_gate result is authoritative." },
        { role: "user", content: JSON.stringify({ event, quant_engine: quant, risk_gate: risk }) },
      ],
      max_tokens: 350, temperature: 0.1,
    });
    const narrative = typeof result?.response === "string" ? result.response.trim() : "";
    return { provider: "cloudflare-workers-ai", model: "@cf/meta/llama-3.2-3b-instruct",
      narrative: narrative.slice(0, 2000) || null, advisory_only: true };
  } catch {
    return { provider: "cloudflare-workers-ai", narrative: null, degraded: true, advisory_only: true };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true, service: "nova-mt5-decision-api", contract: "nova.mt5-decision.v2",
        workers_ai_binding: Boolean(env.AI), quant_adapter_binding: Boolean(env.QUANT_ENGINE),
        event_dedupe_binding: Boolean(env.EVENT_DEDUPE),
        trusted_mt5_bridge_binding: Boolean(env.MT5_BRIDGE),
        machine_auth_configured: Boolean(env.MT5_M2M_CLIENTS),
        quant_adapter_auth_configured: Boolean(env.QUANT_ADAPTER_M2M_TOKEN),
        ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
      });
    }
    if (url.pathname !== "/v1/mt5/events" || request.method !== "POST") return fail("not_found", 404);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
      return fail("content_type_must_be_application_json", 415);
    }
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_BODY_BYTES) return fail("request_too_large", 413);
    let rawBody;
    try { rawBody = await request.text(); } catch { return fail("invalid_request_body", 400); }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return fail("request_too_large", 413);

    const auth = await authenticateMachine(request, rawBody, env);
    if (!auth.ok) return fail(auth.error, auth.status);
    let parsed;
    try { parsed = JSON.parse(rawBody); } catch { return fail("invalid_json", 400); }
    let event;
    try { event = validateEvent(parsed); } catch (error) { return fail(error.message, error.status || 400); }
    event.client_id = auth.clientId;
    const bridge = await fetchTrustedBridgeSnapshot(env, {
      tenantId: auth.tenantId, accountLogin: auth.accountLogin, brokerServer: auth.brokerServer,
    }, event);
    if (!bridge.ok) return fail(bridge.error, bridge.status);
    event.risk_snapshot = bridge.snapshot;
    const dedupeKey = auth.clientId + ":" + event.event_id;

    const claimId = crypto.randomUUID();
    const timestamp = request.headers.get("X-NOVA-Timestamp");
    const reserved = await dedupeRequest(env, dedupeKey, event.event_id, "reserve", claimId, timestamp);
    if (!reserved.ok) return fail(reserved.error, reserved.status);

    const quantCall = await callCompute(env, "/v1/mt5/decision", { event, execution_enabled: false });
    if (!quantCall.ok || !validateQuantResult(quantCall.result, event)) {
      await dedupeRequest(env, dedupeKey, event.event_id, "release", claimId, timestamp);
      return fail(quantCall.error || "invalid_quant_engine_result", quantCall.status || 502);
    }
    const riskCall = await callCompute(env, "/v1/mt5/risk-gate", {
      event, quant_engine_result: quantCall.result,
    });
    if (!riskCall.ok || !validateRiskResult(riskCall.result, event.event_id, event.client_id)) {
      await dedupeRequest(env, dedupeKey, event.event_id, "release", claimId, timestamp);
      return fail(riskCall.error || "invalid_risk_gate_result", riskCall.status || 502);
    }
    const completed = await dedupeRequest(env, dedupeKey, event.event_id, "complete", claimId, timestamp);
    if (!completed.ok) return fail("event_dedupe_completion_failed", 503);

    const { client_id: _clientId, ...aiSafeEvent } = event;
    const ai = await explainWithWorkersAI(env, aiSafeEvent, quantCall.result, riskCall.result);
    const riskPassed = riskCall.result.passed === true;
    return json({
      ok: true, event_id: event.event_id, quant_engine: quantCall.result,
      risk_gate: riskCall.result, ai_explanation: ai,
      decision: riskPassed ? "WAIT" : "REJECT",
      decision_authority: "deterministic_risk_gate",
      decision_reason: riskPassed ? "research_only_no_execution_authority" :
        ((riskCall.result.reason_codes || []).join(",") || "risk_gate_rejected"),
      ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
    });
  },
};
