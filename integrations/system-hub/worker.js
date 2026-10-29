const DEFAULT_UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const DEFAULT_MT5_PROXY_URL = "https://voom-mt5-readonly-proxy.suwapat787.workers.dev";
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || DEFAULT_UI_ORIGIN)
    .split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(configured);
}
function corsHeaders(origin, env) {
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
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
function safeError(error) {
  return json({ error, service: "voom-system-hub", ordersEnabled: false, liveTradingEnabled: false }, 503);
}
function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
}
function supabaseBase(env) {
  const value = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    return url.origin;
  } catch {
    return "";
  }
}
async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }
  try {
    const response = await fetch(base + "/auth/v1/user", {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + token,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6000)
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    if (!response.ok) return { ok: false, status: 503, error: "authentication_provider_unavailable" };
    const user = await response.json();
    return user && typeof user.id === "string" && user.id.length > 0
      ? { ok: true, userId: user.id, token }
      : { ok: false, status: 401, error: "invalid_or_expired_session" };
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}
function connectionUrl(env, query = {}) {
  const base = supabaseBase(env);
  if (!base) return null;
  const url = new URL(base + "/rest/v1/broker_connections");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}
async function queryOwnConnections(env, user, connectionId = "") {
  const url = connectionUrl(env, {
    select: "id,user_id,provider,environment,status,account_label,last_verified_at,created_at,bridge_route_id",
    user_id: "eq." + user.userId,
    order: "created_at.desc",
    limit: connectionId ? "1" : "50",
    ...(connectionId ? { id: "eq." + connectionId } : {})
  });
  if (!url) return { ok: false, status: 503, error: "connection_service_not_configured" };
  try {
    const response = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + user.token,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return { ok: false, status: 503, error: "connection_service_unavailable" };
    const rows = await response.json();
    if (!Array.isArray(rows)) return { ok: false, status: 503, error: "connection_service_invalid_response" };
    return { ok: true, rows };
  } catch {
    return { ok: false, status: 503, error: "connection_service_unavailable" };
  }
}
function publicConnection(row) {
  const providerAllowed = row.provider === "exness_mt5" && row.environment === "demo";
  return {
    connectionId: row.id,
    provider: row.provider,
    environment: row.environment,
    recordStatus: row.status,
    accountLabel: typeof row.account_label === "string" ? row.account_label : null,
    lastVerifiedAt: row.last_verified_at || null,
    createdAt: row.created_at || null,
    bridgeAllocated: Boolean(row.bridge_route_id),
    readiness: row.status === "disabled" ? "disabled"
      : row.status === "pending" || !row.bridge_route_id ? "pending_provisioning"
        : row.status === "connected" ? "configured" : "not_ready",
    dataVerified: false,
    capabilities: {
      accountRead: providerAllowed,
      marketDataRead: providerAllowed,
      orderSubmission: false
    },
    ordersEnabled: false,
    liveTradingEnabled: false
  };
}
function integrationRegistry(env) {
  const authConfigured = Boolean(supabaseBase(env) && env.SUPABASE_PUBLISHABLE_KEY);
  return [
    {
      id: "supabase-auth",
      role: "identity",
      configured: authConfigured,
      verification: "not_checked"
    },
    {
      id: "exness-mt5-demo",
      adapter: "voom-mt5-readonly-proxy",
      environment: "demo",
      mode: "read-only",
      configured: true,
      verification: "per-connection"
    },
    {
      id: "nova-ai",
      endpoint: "https://voom-system-nova-ai.suwapat787.workers.dev",
      mode: "analysis-only",
      configured: true,
      verification: "not_checked"
    },
    {
      id: "remote-mcp",
      endpoint: "https://voom-system-mcp.suwapat787.workers.dev",
      mode: "authenticated-read-only",
      configured: true,
      verification: "not_checked"
    }
  ];
}
async function getConnection(request, env, user, id, origin) {
  if (!CONNECTION_ID.test(id)) return { response: json({ error: "valid_connection_id_required" }, 400, origin, env) };
  const result = await queryOwnConnections(env, user, id);
  if (!result.ok) return { response: json({ error: result.error }, result.status, origin, env) };
  const row = result.rows[0];
  if (!row) return { response: json({ error: "connection_not_found" }, 404, origin, env) };
  if (row.provider !== "exness_mt5" || row.environment !== "demo") {
    return { response: json({ error: "integration_not_allowed" }, 403, origin, env) };
  }
  return { row };
}
async function checkConnection(request, env, user, row, origin) {
  if (row.status !== "connected" || !row.bridge_route_id) {
    return json({
      connectionId: row.id,
      state: "pending_provisioning",
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 409, origin, env);
  }
  const proxyBase = String(env.MT5_READONLY_PROXY_URL || DEFAULT_MT5_PROXY_URL).replace(/\/+$/, "");
  let proxy;
  try {
    proxy = new URL(proxyBase);
    if (proxy.protocol !== "https:" || proxy.username || proxy.password ||
      !proxy.hostname.endsWith(".workers.dev")) throw new Error("invalid proxy");
  } catch {
    return json({ error: "mt5_proxy_not_configured" }, 503, origin, env);
  }
  const target = new URL("/api/account", proxy.origin);
  target.searchParams.set("connection_id", row.id);
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + user.token,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) {
      const error = response.status === 401 ? "session_rejected"
        : response.status === 403 ? "tenant_guard_rejected"
          : response.status === 404 ? "connection_not_found"
            : response.status === 409 ? "bridge_not_provisioned"
              : "mt5_proxy_unavailable";
      const status = response.status === 401 || response.status === 403 || response.status === 404 || response.status === 409
        ? response.status : 502;
      return json({
        connectionId: row.id,
        state: error,
        dataVerified: false,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, status, origin, env);
    }
    // Intentionally discard the account payload: this endpoint verifies the read path without
    // copying balances, account identifiers, or other broker data into control-plane logs/output.
    return json({
      connectionId: row.id,
      state: "data_verified",
      dataVerified: true,
      accountReadSucceeded: true,
      checkedAt: new Date().toISOString(),
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 200, origin, env);
  } catch {
    return json({
      connectionId: row.id,
      state: "mt5_proxy_unavailable",
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 502, origin, env);
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins(env).has(origin)) return new Response(null, { status: 403, headers: BASE_HEADERS });
      return new Response(null, { status: 204, headers: { ...BASE_HEADERS, ...corsHeaders(origin, env) } });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "voom-system-hub",
        status: "ready",
        mode: "control-plane-read-only",
        authConfigured: Boolean(supabaseBase(env) && env.SUPABASE_PUBLISHABLE_KEY),
        mt5ProxyConfigured: Boolean(env.MT5_READONLY_PROXY_URL || DEFAULT_MT5_PROXY_URL),
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false
      });
    }

    if (origin && !allowedOrigins(env).has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, origin, env);
    }

    if (url.pathname === "/v1/integrations" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      return json({
        service: "voom-system-hub",
        integrations: integrationRegistry(env),
        mode: "read-only",
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 200, origin, env);
    }

    if (url.pathname === "/v1/connections" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      const result = await queryOwnConnections(env, auth);
      if (!result.ok) return json({ error: result.error }, result.status, origin, env);
      return json({
        connections: result.rows.map(publicConnection),
        count: result.rows.length,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 200, origin, env);
    }

    const match = /^\/v1\/connections\/([^/]+)\/(status|check)$/.exec(url.pathname);
    if (match && ((match[2] === "status" && request.method === "GET") ||
      (match[2] === "check" && request.method === "POST"))) {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      const result = await getConnection(request, env, auth, match[1], origin);
      if (result.response) return result.response;
      if (match[2] === "check") return checkConnection(request, env, auth, result.row, origin);
      const connection = publicConnection(result.row);
      return json({
        ...connection,
        state: connection.readiness,
        dataVerified: false,
        note: "Status reflects the user's connection record only. Use POST /v1/connections/{id}/check to verify the live read-only account path.",
      }, 200, origin, env);
    }

    return json({ error: "not_found" }, 404, origin, env);
  }
};
