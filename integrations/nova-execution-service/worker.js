import { NOVA_DEMO_RISK_POLICY, getRiskPolicyReadiness } from "./risk-policy.js";

const SERVICE = "nova-execution-service";
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
}
function corsHeaders(origin, env) {
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Idempotency-Key",
    "Access-Control-Max-Age": "300",
    "Vary": "Origin"
  };
}
function json(data, status = 200, origin = "", env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, env)
    }
  });
}
function supabaseBase(env) {
  let raw = String(env.SUPABASE_URL || "").trim();
  while (raw.endsWith("/")) raw = raw.slice(0, -1);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
    return url.origin;
  } catch {
    return "";
  }
}
function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  if (header.slice(0, 7).toLowerCase() !== "bearer ") return "";
  const token = header.slice(7).trim();
  return token && !token.includes(" ") ? token : "";
}
async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }
  try {
    const response = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + token,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    if (!response.ok) return { ok: false, status: 503, error: "authentication_provider_unavailable" };
    const user = await response.json();
    if (!user || typeof user.id !== "string" || !user.id) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}
function capabilityStatus() {
  // Hard-coded fail-closed: request fields and runtime variables cannot enable trading.
  const policyReadiness = getRiskPolicyReadiness(NOVA_DEMO_RISK_POLICY);
  return {
    service: SERVICE,
    state: "disabled",
    implementation: "authenticated-contract-stub",
    orderSubmission: "not_implemented",
    executionEnabled: false,
    ordersEnabled: false,
    liveTradingEnabled: false,
    brokerAdapterConfigured: false,
    riskGatewayConfigured: false,
    intentStoreConfigured: false,
    riskPolicyVersion: NOVA_DEMO_RISK_POLICY.version,
    riskPolicyState: policyReadiness.state,
    missingRiskSettings: policyReadiness.missingRequiredSettings,
    invalidRiskSettings: policyReadiness.invalidSettings
  };
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins(env).has(origin)) {
        return new Response(null, { status: 403, headers: BASE_HEADERS });
      }
      return new Response(null, {
        status: 204,
        headers: { ...BASE_HEADERS, ...corsHeaders(origin, env) }
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, health: "ok", ...capabilityStatus() }, 200, origin, env);
    }
    if (origin && !allowedOrigins(env).has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, origin, env);
    }

    if (url.pathname === "/v1/trading/execution/status" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      return json({ ...capabilityStatus(), authenticated: true }, 200, origin, env);
    }

    if (url.pathname === "/v1/trading/intents" && request.method === "POST") {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      // Do not parse, persist, queue, forward or execute untrusted model/client payloads.
      return json({
        error: "execution_disabled",
        state: "not_accepted",
        intentAccepted: false,
        reason: "execution_service_not_enabled",
        ...capabilityStatus()
      }, 423, origin, env);
    }

    const intentPrefix = "/v1/trading/intents/";
    const intentId = url.pathname.startsWith(intentPrefix) ? url.pathname.slice(intentPrefix.length) : "";
    if (request.method === "GET" && intentId && intentId.length <= 80 && !intentId.includes("/")) {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      return json({ error: "intent_store_not_configured", state: "unavailable" }, 503, origin, env);
    }
    return json({ error: "not_found" }, 404, origin, env);
  }
};
