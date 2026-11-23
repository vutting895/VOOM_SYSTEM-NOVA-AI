import { createRemoteJWKSet, jwtVerify } from "jose";

const VERSION = "0.1.0";
const ROLES = new Set(["admin", "operator", "viewer"]);
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const JWKS_CACHE = new Map();

function json(body, status = 200, origin = "", env = {}) {
  const headers = { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function errorResponse(code, status, origin, env) {
  return json({ error: code, liveTrading: false, brokerWrites: false }, status, origin, env);
}
function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
}
function getJwks(url) {
  let jwks = JWKS_CACHE.get(url);
  if (!jwks) { jwks = createRemoteJWKSet(new URL(url)); JWKS_CACHE.set(url, jwks); }
  return jwks;
}
export function authorizeClaims(payload, minimumRole = "viewer") {
  const role = typeof payload?.app_metadata?.nova_role === "string" ? payload.app_metadata.nova_role : "";
  if (!ROLES.has(role)) return { ok: false, status: 403, error: "role_not_provisioned" };
  if ((ROLE_RANK[role] || 0) < (ROLE_RANK[minimumRole] || 99)) return { ok: false, status: 403, error: "insufficient_role" };
  if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, status: 401, error: "invalid_subject" };
  return { ok: true, user: { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null, role } };
}
async function authenticate(request, env, minimumRole = "viewer") {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };
  if (!env.SUPABASE_URL) return { ok: false, status: 503, error: "auth_not_configured" };
  let projectUrl;
  try {
    projectUrl = new URL(env.SUPABASE_URL);
    if (projectUrl.protocol !== "https:" || projectUrl.username || projectUrl.password) return { ok: false, status: 503, error: "auth_not_configured" };
  } catch { return { ok: false, status: 503, error: "auth_not_configured" }; }
  try {
    const issuer = new URL("/auth/v1", projectUrl).toString().replace(/\/$/, "");
    const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", projectUrl).toString();
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      issuer, audience: "authenticated", algorithms: ["ES256", "RS256"], clockTolerance: 5,
    });
    return authorizeClaims(payload, minimumRole);
  } catch { return { ok: false, status: 401, error: "invalid_or_expired_session" }; }
}
async function supabaseRead(env, token, table, select, order) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) return { ok: false, status: 503, error: "supabase_read_key_not_configured" };
  const url = new URL("/rest/v1/" + table, env.SUPABASE_URL);
  url.searchParams.set("select", select);
  url.searchParams.set("order", order);
  url.searchParams.set("limit", "50");
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token, Accept: "application/json", "Accept-Profile": "nova" },
      signal: AbortSignal.timeout(8000), redirect: "error",
    });
  } catch { return { ok: false, status: 503, error: "supabase_data_unavailable" }; }
  if (response.status === 401 || response.status === 403) return { ok: false, status: 403, error: "data_access_denied" };
  if (!response.ok) return { ok: false, status: 503, error: "data_source_not_ready" };
  try {
    const data = await response.json();
    return Array.isArray(data) ? { ok: true, data } : { ok: false, status: 502, error: "invalid_data_response" };
  } catch { return { ok: false, status: 502, error: "invalid_data_response" }; }
}
async function handleRoute(path, request, env, origin, user) {
  if (path === "/v1/me") return json(user, 200, origin, env);
  if (path === "/v1/services") return json({ services: [
    { name: "nova-core-api", status: "available" },
    { name: "nova-ai-research", status: "not_verified" },
    { name: "mt5-bridge", status: "not_connected" },
    { name: "market-feed", status: "not_connected" },
    { name: "risk-policy", status: "not_configured" },
  ] }, 200, origin, env);
  if (path === "/v1/bridge/status") return json({ connected: false, lastHeartbeat: null, lastSync: null, latencyMs: null }, 200, origin, env);
  if (path === "/v1/bridge/account") return errorResponse("bridge_account_source_not_configured", 503, origin, env);
  if (path === "/v1/risk/policy") return errorResponse("risk_policy_source_not_configured", 503, origin, env);
  if (path === "/v1/assistant/status") return json({
    provider: env.ASSISTANT_PROVIDER || "not_configured",
    model: env.ASSISTANT_MODEL || "not_configured",
    ready: false,
  }, 200, origin, env);
  if (path === "/v1/approvals") {
    const result = await supabaseRead(env, bearer(request), "approvals", "id,kind,requested_by,created_at,status,decided_by", "created_at.desc");
    if (!result.ok) return errorResponse(result.error, result.status, origin, env);
    return json({ items: result.data.map((x) => ({ id: x.id, kind: x.kind, requestedBy: x.requested_by, createdAt: x.created_at, status: x.status, decidedBy: x.decided_by || undefined })) }, 200, origin, env);
  }
  if (path === "/v1/audit") {
    const result = await supabaseRead(env, bearer(request), "audit_events", "id,at,actor,action,level", "at.desc");
    if (!result.ok) return errorResponse(result.error, result.status, origin, env);
    return json({ events: result.data.map((x) => ({ id: x.id, at: x.at, actor: x.actor, action: x.action, level: x.level })) }, 200, origin, env);
  }
  return errorResponse("not_found", 404, origin, env);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== env.ALLOWED_ORIGIN) return errorResponse("origin_not_allowed", 403, "", env);
    if (request.method === "OPTIONS") {
      if (!origin || origin !== env.ALLOWED_ORIGIN) return errorResponse("origin_not_allowed", 403, "", env);
      return new Response(null, { status: 204, headers: {
        ...BASE_HEADERS, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept", "Access-Control-Max-Age": "300", Vary: "Origin",
      } });
    }
    if (url.pathname === "/v1/health") {
      if (request.method !== "GET") return errorResponse("method_not_allowed", 405, origin, env);
      return json({ status: "degraded", version: VERSION, time: new Date().toISOString(), liveTrading: false, brokerWrites: false }, 200, origin, env);
    }
    if (request.method !== "GET") return errorResponse("method_not_allowed", 405, origin, env);
    const allowed = new Set(["/v1/me", "/v1/services", "/v1/bridge/status", "/v1/bridge/account", "/v1/risk/policy", "/v1/approvals", "/v1/audit", "/v1/assistant/status"]);
    if (!allowed.has(url.pathname)) return errorResponse("not_found", 404, origin, env);
    const minimumRole = ["/v1/bridge/account", "/v1/approvals", "/v1/audit"].includes(url.pathname) ? "operator" : "viewer";
    const auth = await authenticate(request, env, minimumRole);
    if (!auth.ok) return errorResponse(auth.error, auth.status, origin, env);
    return handleRoute(url.pathname, request, env, origin, auth.user);
  },
};
