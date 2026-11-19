const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_PATHS = new Set(["/v1/mt5/decision", "/v1/mt5/risk-gate"]);
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
});
function fail(error, status) {
  return json({ error, execution_enabled: false, live_trading_enabled: false }, status);
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authorizeServiceBinding(request, env) {
  const expected = env.QUANT_ADAPTER_M2M_TOKEN;
  if (typeof expected !== "string" || expected.length < 32) {
    return { ok: false, status: 503, error: "service_auth_not_configured" };
  }
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match || !constantTimeEqual(match[1], expected)) {
    return { ok: false, status: 401, error: "service_authentication_required" };
  }
  return { ok: true };
}
function runtimeOrigin(env) {
  const configured = env.NOVA_QUANT_RUNTIME_ORIGIN;
  if (typeof configured !== "string" || !configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "nova-python-quant-runtime-adapter",
        runtime_origin_configured: Boolean(runtimeOrigin(env)),
        runtime_token_configured: Boolean(env.NOVA_QUANT_M2M_TOKEN),
        service_binding_auth_configured: Boolean(env.QUANT_ADAPTER_M2M_TOKEN),
        execution_enabled: false,
      });
    }
    if (request.method !== "POST" || !ALLOWED_PATHS.has(url.pathname)) return fail("not_found", 404);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
      return fail("content_type_must_be_application_json", 415);
    }
    const callerAuth = authorizeServiceBinding(request, env);
    if (!callerAuth.ok) return fail(callerAuth.error, callerAuth.status);
    const origin = runtimeOrigin(env);
    const token = env.NOVA_QUANT_M2M_TOKEN;
    if (!origin || typeof token !== "string" || token.length < 32) {
      return fail("quant_runtime_adapter_not_configured", 503);
    }
    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_BODY_BYTES) return fail("request_too_large", 413);
    let body;
    try {
      body = await request.text();
    } catch {
      return fail("invalid_request_body", 400);
    }
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return fail("request_too_large", 413);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return fail("invalid_json", 400);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalid_json_object", 400);
    if (url.pathname === "/v1/mt5/decision") {
      if (!parsed.event || parsed.execution_enabled !== false) return fail("invalid_quant_decision_contract", 400);
    } else if (!parsed.event || !parsed.quant_engine_result) {
      return fail("invalid_risk_gate_contract", 400);
    }

    try {
      const upstream = await fetch(new URL(url.pathname, origin), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "X-NOVA-Contract": "nova.mt5-decision.v2",
          Accept: "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      });
      const responseText = await upstream.text();
      if (new TextEncoder().encode(responseText).byteLength > MAX_BODY_BYTES) {
        return fail("quant_runtime_response_too_large", 502);
      }
      let responseBody;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        return fail("quant_runtime_invalid_response", 502);
      }
      if (!upstream.ok) {
        const status = upstream.status === 422 ? 422 : 502;
        return fail(status === 422 ? "quant_runtime_input_rejected" : "quant_runtime_unavailable", status);
      }
      return json(responseBody, 200);
    } catch {
      return fail("quant_runtime_unavailable", 502);
    }
  },
};
