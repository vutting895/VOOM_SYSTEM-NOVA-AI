const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 60;
const MODULE_IDS = new Set(Array.from({ length: 30 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
});
const fail = (error, status) => json({
  error, ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
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
export async function authenticateMachine(request, rawBody, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = env.MT5_M2M_HMAC_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    return { ok: false, status: 503, error: "machine_auth_not_configured" };
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
  const expected = "sha256=" + await hmacHex(secret, timestamp + "." + rawBody);
  if (!safeEqual(signature.toLowerCase(), expected)) {
    return { ok: false, status: 401, error: "invalid_machine_signature" };
  }
  return { ok: true };
}
export function validateEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("invalid_event_object"), { status: 400 });
  }
  const requiredString = (key, max) => {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > max) {
      throw Object.assign(new Error("invalid_" + key), { status: 400 });
    }
    return value[key].trim();
  };
  const eventId = requiredString("event_id", 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(eventId)) throw Object.assign(new Error("invalid_event_id"), { status: 400 });
  const moduleId = requiredString("module_id", 3);
  if (!MODULE_IDS.has(moduleId)) throw Object.assign(new Error("unsupported_module_id"), { status: 400 });
  const eventType = requiredString("event_type", 64);
  const symbol = requiredString("symbol", 32);
  const timeframe = requiredString("timeframe", 12);
  const occurredAt = requiredString("occurred_at", 40);
  if (!Number.isFinite(Date.parse(occurredAt)) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(occurredAt)) {
    throw Object.assign(new Error("occurred_at_must_be_timezone_aware"), { status: 400 });
  }
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) {
    throw Object.assign(new Error("invalid_payload"), { status: 400 });
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(value.payload)).byteLength;
  if (payloadBytes > 32 * 1024) throw Object.assign(new Error("event_payload_too_large"), { status: 413 });
  return {
    schema_version: "nova.mt5-event.v1", event_id: eventId, module_id: moduleId,
    event_type: eventType, symbol, timeframe, occurred_at: occurredAt,
    account_mode: "demo", payload: value.payload,
  };
}
function riskGate(event) {
  const p = event.payload;
  const reasons = [];
  const numeric = ["allocation_pct", "daily_loss_pct", "drawdown_pct", "leverage", "data_age_seconds"];
  for (const key of numeric) {
    if (typeof p[key] !== "number" || !Number.isFinite(p[key])) reasons.push("missing_or_invalid_" + key);
  }
  if (reasons.length === 0) {
    if (p.allocation_pct <= 0 || p.allocation_pct > 20) reasons.push("allocation_limit");
    if (p.daily_loss_pct < 0 || p.daily_loss_pct >= 3) reasons.push("daily_loss_limit");
    if (p.drawdown_pct < 0 || p.drawdown_pct >= 7) reasons.push("drawdown_limit");
    if (p.leverage < 1 || p.leverage > 1) reasons.push("leverage_limit");
    if (p.data_age_seconds < 0 || p.data_age_seconds > 60) reasons.push("stale_market_data");
  }
  if (p.market_open !== true) reasons.push("market_closed_or_unknown");
  return {
    policy_version: "nova-risk-1.0", passed: reasons.length === 0,
    status: reasons.length === 0 ? "allow_paper_analysis" : "reject",
    reason_codes: reasons, live_execution_allowed: false,
  };
}
async function reserveEvent(env, eventId, timestamp) {
  const namespace = env.EVENT_DEDUPE;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return { ok: false, status: 503, error: "event_dedupe_service_not_configured" };
  }
  try {
    const id = namespace.idFromName(eventId);
    const stub = namespace.get(id);
    const response = await stub.fetch("https://event-dedupe.internal/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, timestamp }),
    });
    if (response.status === 409) return { ok: false, status: 409, error: "duplicate_event" };
    if (!response.ok) return { ok: false, status: 503, error: "event_dedupe_unavailable" };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "event_dedupe_unavailable" };
  }
}
async function callQuantEngine(env, event) {
  if (!env.QUANT_ENGINE || typeof env.QUANT_ENGINE.fetch !== "function") {
    return { ok: false, status: 503, error: "quant_engine_binding_not_configured" };
  }
  try {
    const response = await env.QUANT_ENGINE.fetch("https://quant-engine.internal/v1/mt5/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-NOVA-Contract": "nova.mt5-decision.v1" },
      body: JSON.stringify({ event, execution_enabled: false }),
    });
    if (!response.ok) return { ok: false, status: 502, error: "quant_engine_rejected_request" };
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return { ok: false, status: 502, error: "quant_engine_invalid_response" };
    }
    return { ok: true, result };
  } catch {
    return { ok: false, status: 502, error: "quant_engine_unavailable" };
  }
}
async function explainWithWorkersAI(env, event, quant, risk) {
  if (!env.AI || typeof env.AI.run !== "function") return { provider: "none", narrative: null };
  try {
    const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        { role: "system", content: "You are a bounded trading research explainer. Explain only the supplied event and quantitative output. Never invent data, change risk decisions, authorize orders, or claim execution. Return concise plain text." },
        { role: "user", content: JSON.stringify({ event, quant, risk }) },
      ],
      max_tokens: 350, temperature: 0.1,
    });
    const narrative = typeof result?.response === "string" ? result.response.trim() : "";
    return { provider: "cloudflare-workers-ai", model: "@cf/meta/llama-3.2-3b-instruct",
      narrative: narrative.slice(0, 2000) || null };
  } catch {
    return { provider: "cloudflare-workers-ai", narrative: null, degraded: true };
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "nova-mt5-decision-api", contract: "nova.mt5-decision.v1",
        workers_ai_binding: Boolean(env.AI), quant_engine_binding: Boolean(env.QUANT_ENGINE),
        machine_auth_configured: Boolean(env.MT5_M2M_HMAC_SECRET),
        ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false });
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
    const reserved = await reserveEvent(env, event.event_id, request.headers.get("X-NOVA-Timestamp"));
    if (!reserved.ok) return fail(reserved.error, reserved.status);
    const quant = await callQuantEngine(env, event);
    if (!quant.ok) return fail(quant.error, quant.status);
    const risk = riskGate(event);
    const ai = await explainWithWorkersAI(env, event, quant.result, risk);
    return json({
      ok: true, event_id: event.event_id, module_id: event.module_id,
      quant_engine: quant.result, risk_gate: risk, ai_explanation: ai,
      decision: risk.passed ? "research_candidate" : "rejected",
      ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false,
    });
  },
};