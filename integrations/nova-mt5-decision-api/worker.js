import { EventDedupe } from "./event-dedupe.js";
export { EventDedupe };

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
async function dedupeRequest(env, eventId, operation, claimId, timestamp) {
  const namespace = env.EVENT_DEDUPE;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return { ok: false, status: 503, error: "event_dedupe_service_not_configured" };
  }
  try {
    const stub = namespace.get(namespace.idFromName(eventId));
    const response = await stub.fetch("https://event-dedupe.internal/" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  try {
    const response = await env.QUANT_ENGINE.fetch("https://nova-quant-engine.internal" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-NOVA-Contract": "nova.mt5-decision.v1" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return {
      ok: false,
      status: response.status === 422 ? 422 : 502,
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
function validateQuantResult(result) {
  return Boolean(result &&
    result.engine === "HybridQuantumQuantEngine" &&
    result.evaluation_status === "research_only" &&
    result.execution_enabled === false &&
    typeof result.backend === "string" &&
    typeof result.directional_probability_up === "number" &&
    Number.isFinite(result.directional_probability_up) &&
    result.directional_probability_up >= 0 &&
    result.directional_probability_up <= 1);
}
function validateRiskResult(result) {
  return Boolean(result &&
    typeof result.policy_version === "string" &&
    typeof result.passed === "boolean" &&
    typeof result.action === "string" &&
    result.execution_authorized === false &&
    result.live_trading_enabled === false);
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
        ok: true,
        service: "nova-mt5-decision-api",
        contract: "nova.mt5-decision.v1",
        workers_ai_binding: Boolean(env.AI),
        quant_adapter_binding: Boolean(env.QUANT_ENGINE),
        event_dedupe_binding: Boolean(env.EVENT_DEDUPE),
        machine_auth_configured: Boolean(env.MT5_M2M_HMAC_SECRET),
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false,
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

    const claimId = crypto.randomUUID();
    const timestamp = request.headers.get("X-NOVA-Timestamp");
    const reserved = await dedupeRequest(env, event.event_id, "reserve", claimId, timestamp);
    if (!reserved.ok) return fail(reserved.error, reserved.status);

    const quantCall = await callCompute(env, "/v1/mt5/decision", {
      event, execution_enabled: false,
    });
    if (!quantCall.ok || !validateQuantResult(quantCall.result)) {
      await dedupeRequest(env, event.event_id, "release", claimId, timestamp);
      return fail(quantCall.error || "invalid_quant_engine_result", quantCall.status || 502);
    }

    const riskCall = await callCompute(env, "/v1/mt5/risk-gate", {
      event, quant_engine_result: quantCall.result,
    });
    if (!riskCall.ok || !validateRiskResult(riskCall.result)) {
      await dedupeRequest(env, event.event_id, "release", claimId, timestamp);
      return fail(riskCall.error || "invalid_risk_gate_result", riskCall.status || 502);
    }

    const completed = await dedupeRequest(env, event.event_id, "complete", claimId, timestamp);
    if (!completed.ok) return fail("event_dedupe_completion_failed", 503);

    // AI runs only after Quant Engine and Risk Gate. Its prose is never a decision input.
    const ai = await explainWithWorkersAI(env, event, quantCall.result, riskCall.result);
    return json({
      ok: true,
      event_id: event.event_id,
      module_id: event.module_id,
      quant_engine: quantCall.result,
      risk_gate: riskCall.result,
      ai_explanation: ai,
      decision: riskCall.result.passed ? "research_candidate" : "rejected",
      decision_authority: "deterministic_risk_gate",
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false,
    });
  },
};
