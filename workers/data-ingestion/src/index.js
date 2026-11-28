const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENT_AGE_DAYS = 3650;
const HEX_64 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN = new Set([
  "account_login", "account_number", "login", "server_name", "password",
  "token", "secret", "api_key", "access_token", "refresh_token",
  "balance", "equity", "free_margin", "margin", "email"
]);
const EVENT_TYPES = new Set([
  "market_snapshot", "signal", "decision", "risk_check", "execution_audit", "trade_outcome"
]);
const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });
}
function fail(status, code) {
  return response({ ok: false, error: code, mode: "telemetry-only" }, status);
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}
function scanForbidden(value) {
  if (Array.isArray(value)) return value.every(scanForbidden);
  if (!isObject(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key.toLowerCase()) || !scanForbidden(child)) return false;
  }
  return true;
}
function validUtc(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (isObject(value)) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isStringArray(value, min = 0, max = 32) {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every(item => typeof item === "string" && item.length <= 64);
}
function validateEvent(event) {
  if (!isObject(event) || !hasOnlyKeys(event, new Set([
    "schema_version", "event_id", "event_type", "occurred_at", "source", "scope",
    "market", "signal", "decision", "risk", "execution_audit", "outcome"
  ]))) return "invalid_event_object";
  if (!scanForbidden(event)) return "forbidden_field";
  if (event.schema_version !== "1.0" || !UUID.test(event.event_id || "") ||
      !EVENT_TYPES.has(event.event_type) || !validUtc(event.occurred_at)) return "invalid_event_header";
  const source = event.source;
  if (!isObject(source) || !hasOnlyKeys(source, new Set([
    "component", "ea_version", "source_sha256", "repo_commit", "symbol", "timeframe", "model_version"
  ]))) return "invalid_source";
  if (source.component !== "mt5_ea" || typeof source.ea_version !== "string" || source.ea_version.length < 1 || source.ea_version.length > 32 ||
      !HEX_64.test(source.source_sha256 || "") || !GIT_SHA.test(source.repo_commit || "") ||
      typeof source.symbol !== "string" || !source.symbol || source.symbol.length > 32 || !TIMEFRAMES.has(source.timeframe) ||
      (source.model_version !== undefined && (typeof source.model_version !== "string" || source.model_version.length > 64))) return "invalid_source_provenance";
  const scope = event.scope;
  if (!isObject(scope) || !hasOnlyKeys(scope, new Set(["account_scope_hmac", "magic_scope"])) ||
      !HEX_64.test(scope.account_scope_hmac || "") ||
      !Number.isSafeInteger(scope.magic_scope) || scope.magic_scope < 0) return "invalid_scope";
  if (event.market !== undefined) {
    const market = event.market;
    if (!isObject(market) || !hasOnlyKeys(market, new Set([
      "bid", "ask", "spread_points", "atr", "bar_time_utc", "bar_closed", "data_quality"
    ]))) return "invalid_market";
    if (market.bar_time_utc !== undefined && !validUtc(market.bar_time_utc)) return "invalid_market_time";
    if (["bid", "ask", "spread_points", "atr"].some(k => market[k] !== undefined &&
      (typeof market[k] !== "number" || !Number.isFinite(market[k]) || market[k] < 0))) return "invalid_market_value";
    if (market.bar_closed !== undefined && typeof market.bar_closed !== "boolean") return "invalid_bar_closed";
    if (["signal", "decision"].includes(event.event_type) && market.bar_closed !== true) return "unclosed_bar";
    if (market.data_quality !== undefined && !["PASS", "WARN", "BLOCKED"].includes(market.data_quality)) return "invalid_data_quality";
  }
  if (event.signal !== undefined) {
    const s = event.signal;
    if (!isObject(s) || !hasOnlyKeys(s, new Set(["strategy", "side", "score", "reason_codes", "feature_hash"])) ||
      typeof s.strategy !== "string" || s.strategy.length < 1 || s.strategy.length > 64 ||
      !["BUY", "SELL", "NONE"].includes(s.side) ||
      typeof s.score !== "number" || !Number.isFinite(s.score) || s.score < 0 || s.score > 1 ||
      (s.reason_codes !== undefined && !isStringArray(s.reason_codes)) ||
      (s.feature_hash !== undefined && !HEX_64.test(s.feature_hash))) return "invalid_signal";
  }
  if (event.decision !== undefined) {
    const d = event.decision;
    if (!isObject(d) || !hasOnlyKeys(d, new Set(["result", "model_version", "reason_codes", "confidence", "feature_hash"])) ||
      !["ACCEPT", "REJECT", "ABSTAIN"].includes(d.result) || typeof d.model_version !== "string" ||
      d.model_version.length < 1 || d.model_version.length > 64 || !isStringArray(d.reason_codes, 1, 32) ||
      (d.confidence !== undefined && (typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1)) ||
      (d.feature_hash !== undefined && !HEX_64.test(d.feature_hash))) return "invalid_decision";
  }
  if (event.execution_audit !== undefined) {
    const a = event.execution_audit;
    if (!isObject(a) || !hasOnlyKeys(a, new Set(["mode", "broker_request_attempted", "broker_transport_calls", "blocked_mutation_attempts"])) ||
      a.mode !== "READ_ONLY" || a.broker_request_attempted !== false || a.broker_transport_calls !== 0 ||
      (a.blocked_mutation_attempts !== undefined && (!Number.isSafeInteger(a.blocked_mutation_attempts) || a.blocked_mutation_attempts < 0))) return "execution_not_read_only";
  }
  if (event.risk !== undefined) {
    const r = event.risk;
    if (!isObject(r) || !hasOnlyKeys(r, new Set(["allowed", "account_currency", "proposed_risk_pct", "proposed_risk_money", "open_risk_pct", "position_count", "reason_codes"])) ||
      typeof r.allowed !== "boolean" || !/^[A-Z]{3}$/.test(r.account_currency || "") ||
      !isFiniteNonNegative(r.open_risk_pct) || !Number.isSafeInteger(r.position_count) || r.position_count < 0 ||
      ["proposed_risk_pct", "proposed_risk_money"].some(k => r[k] !== undefined && !isFiniteNonNegative(r[k])) ||
      (r.reason_codes !== undefined && !isStringArray(r.reason_codes))) return "invalid_risk";
  }
  if (event.outcome !== undefined) {
    const o = event.outcome;
    if (!isObject(o) || !hasOnlyKeys(o, new Set(["closed_volume", "realized_pnl", "commission", "swap", "account_currency", "close_reason", "position_fingerprint"])) ||
      ["closed_volume"].some(k => o[k] !== undefined && !isFiniteNonNegative(o[k])) ||
      ["realized_pnl", "commission", "swap"].some(k => o[k] !== undefined && (typeof o[k] !== "number" || !Number.isFinite(o[k]))) ||
      (o.account_currency !== undefined && !/^[A-Z]{3}$/.test(o.account_currency)) ||
      (o.close_reason !== undefined && (typeof o.close_reason !== "string" || o.close_reason.length > 64)) ||
      (o.position_fingerprint !== undefined && !HEX_64.test(o.position_fingerprint))) return "invalid_outcome";
  }
  const requiredByType = {
    market_snapshot: "market", signal: "signal", decision: "decision",
    risk_check: "risk", execution_audit: "execution_audit", trade_outcome: "outcome"
  };
  if (!event[requiredByType[event.event_type]]) return "event_type_payload_missing";
  return null;
}
async function authenticate(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(auth)) return null;
  let base;
  try { base = new URL(env.SUPABASE_URL); } catch { return null; }
  if (base.protocol !== "https:" || base.username || base.password) return null;
  const url = new URL("/auth/v1/user", base);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
  } catch { return null; }
  if (!res.ok) return null;
  let user;
  try { user = await res.json(); } catch { return null; }
  return typeof user?.id === "string" && user.id ? user.id : null;
}
async function ingest(request, env, tenantId) {
  if (!env.DB) return fail(503, "storage_unavailable");
  const length = Number(request.headers.get("content-length") || "0");
  if (length > MAX_BODY_BYTES) return fail(413, "payload_too_large");
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return fail(415, "json_required");
  let raw;
  try { raw = await request.text(); } catch { return fail(400, "body_unreadable"); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return fail(413, "payload_too_large");
  let event;
  try { event = JSON.parse(raw); } catch { return fail(400, "invalid_json"); }
  const validationError = validateEvent(event);
  if (validationError) return fail(422, validationError);
  const occurred = Date.parse(event.occurred_at);
  if (occurred > Date.now() + 5 * 60 * 1000 || occurred < Date.now() - MAX_EVENT_AGE_DAYS * 86400 * 1000) {
    return fail(422, "event_timestamp_out_of_policy");
  }
  const payload = canonical(event);
  const digest = await sha256Hex(payload);
  const insertedAt = new Date().toISOString();
  try {
    const writeResult = await env.DB.prepare(
      "INSERT OR IGNORE INTO nova_brain_events (tenant_id,event_id,schema_version,event_type,occurred_at,payload_json,payload_sha256,received_at) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(tenantId, event.event_id, event.schema_version, event.event_type, event.occurred_at, payload, digest, insertedAt).run();
    const stored = await env.DB.prepare(
      "SELECT payload_sha256, received_at FROM nova_brain_events WHERE tenant_id=? AND event_id=?"
    ).bind(tenantId, event.event_id).first();
    if (!stored) return fail(503, "storage_receipt_missing");
    if (stored.payload_sha256 !== digest) return fail(409, "event_id_payload_conflict");
    const duplicate = Number(writeResult?.meta?.changes || 0) === 0;
    return response({
      ok: true, status: duplicate ? "DUPLICATE_CONFIRMED" : "ACCEPTED",
      receipt: { event_id: event.event_id, payload_sha256: digest, received_at: stored.received_at, schema_version: event.schema_version }
    }, duplicate ? 200 : 201);
  } catch {
    return fail(503, "storage_write_failed");
  }
}
async function readEvent(request, env, tenantId, eventId) {
  if (!UUID.test(eventId)) return fail(400, "invalid_event_id");
  try {
    const row = await env.DB.prepare(
      "SELECT event_id,schema_version,event_type,occurred_at,payload_json,payload_sha256,received_at FROM nova_brain_events WHERE tenant_id=? AND event_id=?"
    ).bind(tenantId, eventId).first();
    if (!row) return fail(404, "event_not_found");
    if (await sha256Hex(row.payload_json) !== row.payload_sha256) return fail(500, "stored_payload_integrity_failure");
    return response({
      ok: true,
      receipt: { event_id: row.event_id, payload_sha256: row.payload_sha256, received_at: row.received_at, schema_version: row.schema_version },
      event: JSON.parse(row.payload_json)
    });
  } catch { return fail(503, "storage_read_failed"); }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return response({ ok: true, service: "nova-data-ingestion", mode: "telemetry-only", ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false });
    }
    if (request.method !== "POST" && request.method !== "GET") return fail(405, "method_not_allowed");
    const tenantId = await authenticate(request, env);
    if (!tenantId) return fail(401, "authentication_required");
    if (request.method === "POST" && url.pathname === "/v1/events") return ingest(request, env, tenantId);
    const match = /^\/v1\/events\/([0-9a-f-]+)$/i.exec(url.pathname);
    if (request.method === "GET" && match) return readEvent(request, env, tenantId, match[1]);
    return fail(404, "not_found");
  }
};
