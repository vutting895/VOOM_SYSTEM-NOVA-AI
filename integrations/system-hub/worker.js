import { listBrokerProviders } from "./broker-registry.js";
const DEFAULT_UI_ORIGIN = "https://voomsystem.netlify.app";
const CLOUDFLARE_FALLBACK_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const DEFAULT_MT5_PROXY_URL = "https://voom-mt5-readonly-proxy.suwapat787.workers.dev";
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || (DEFAULT_UI_ORIGIN + "," + CLOUDFLARE_FALLBACK_ORIGIN))
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
function safeAuthDiagnostic(error) {
  const errorName = typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(error.name)
    ? error.name
    : "Error";
  const message = String(error?.message || "unknown")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{64,}/g, "[redacted]")
    .slice(0, 160);
  return "System Hub could not reach Supabase Auth; errorName=" + errorName + "; message=" + message;
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }

  const authUrl = new URL("/auth/v1/user", base);
  const authInit = {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + token,
      Accept: "application/json"
    },
    cache: "no-store",
    // Inspect redirects explicitly so the bearer token/key stay on the configured origin.
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  };
  let response;
  try {
    response = await fetch(authUrl, authInit);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      let redirectedUrl;
      try {
        redirectedUrl = new URL(location, authUrl);
      } catch {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
      if (redirectedUrl.protocol !== "https:" || redirectedUrl.origin !== authUrl.origin) {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
      response = await fetch(redirectedUrl, authInit);
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
    }
  } catch (error) {
    console.warn(safeAuthDiagnostic(error));
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: "invalid_or_expired_session" };
  }
  if (!response.ok) {
    console.warn("System Hub Supabase Auth returned non-success; status=" + response.status);
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
  try {
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
      // Do not automatically forward the user token across redirects.
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return { ok: false, status: 503, error: "connection_service_unavailable" };
    const rows = await response.json();
    if (!Array.isArray(rows)) return { ok: false, status: 503, error: "connection_service_invalid_response" };
    return { ok: true, rows };
  } catch {
    return { ok: false, status: 503, error: "connection_service_unavailable" };
  }
}

async function createConnection(request, env, user, origin) {
  const existingResult = await queryOwnConnections(env, user);
  if (!existingResult.ok) {
    return json({ error: existingResult.error }, existingResult.status, origin, env);
  }
  const existing = existingResult.rows.find((row) => row.provider === "exness_mt5" && row.environment === "demo");
  if (existing) {
    return json({
      connection: publicConnection(existing),
      created: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 200, origin, env);
  }

  const url = connectionUrl(env, {
    select: "id,user_id,provider,environment,status,account_label,last_verified_at,created_at,bridge_route_id",
    on_conflict: "user_id,provider,environment"
  });
  if (!url) return json({ error: "connection_service_not_configured" }, 503, origin, env);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + user.token,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify({
        provider: "exness_mt5",
        environment: "demo",
        status: "pending",
        account_label: "Exness MT5 Demo"
      }),
      cache: "no-store",
      // Do not automatically forward the user token across redirects.
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return json({ error: "connection_service_unavailable" }, 503, origin, env);
  }

  if (response.ok) {
    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.id) {
      return json({
        connection: publicConnection(row),
        created: true,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 201, origin, env);
    }
  }

  // A concurrent request may have created the row. Re-read under the same user token
  // rather than returning a duplicate or retrying an uncertain write.
  const raced = await queryOwnConnections(env, user);
  if (raced.ok) {
    const row = raced.rows.find((item) => item.provider === "exness_mt5" && item.environment === "demo");
    if (row) {
      return json({
        connection: publicConnection(row),
        created: false,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 200, origin, env);
    }
  }
  return json({ error: "connection_request_failed" }, 503, origin, env);
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

const MT5_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const MT5_SYMBOL = /^[A-Za-z0-9._-]{1,40}$/;

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function proxyError(responseStatus, body) {
  const state = responseStatus === 401 ? "session_rejected"
    : responseStatus === 403 ? "tenant_guard_rejected"
      : responseStatus === 404 ? "upstream_not_found"
        : responseStatus === 409 ? "bridge_not_provisioned"
          : responseStatus === 503 ? "bridge_or_proxy_unavailable"
            : responseStatus === 504 ? "bridge_response_timeout" : "mt5_proxy_unavailable";
  const status = [400, 401, 403, 404, 409].includes(responseStatus) ? responseStatus : 502;
  return { ok: false, status, error: state, detail: typeof body?.error === "string" ? body.error : undefined };
}
async function requestMt5Proxy(env, user, row, path, query = {}) {
  if (row.status !== "connected" || !row.bridge_route_id) {
    return { ok: false, status: 409, error: "pending_provisioning" };
  }
  const proxyBase = String(env.MT5_READONLY_PROXY_URL || DEFAULT_MT5_PROXY_URL).replace(/\/+$/, "");
  let proxy;
  try {
    proxy = new URL(proxyBase);
    if (proxy.protocol !== "https:" || proxy.username || proxy.password ||
      !proxy.hostname.endsWith(".workers.dev") ||
      !["/api/account", "/api/quotes"].includes(path)) throw new Error("invalid proxy");
  } catch {
    return { ok: false, status: 503, error: "mt5_proxy_not_configured" };
  }

  const target = new URL(path, proxy.origin);
  target.searchParams.set("connection_id", row.id);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, String(value));

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
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return proxyError(response.status, body);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 502, error: "mt5_proxy_invalid_response" };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 502, error: "mt5_proxy_unavailable" };
  }
}
function connectionNotReady(row, origin, env) {
  return json({
    connectionId: row.id,
    state: row.status === "disabled" ? "connection_disabled" : "pending_provisioning",
    dataVerified: false,
    ordersEnabled: false,
    liveTradingEnabled: false
  }, row.status === "disabled" ? 403 : 409, origin, env);
}
async function checkConnection(request, env, user, row, origin) {
  const result = await requestMt5Proxy(env, user, row, "/api/account");
  if (!result.ok) {
    return json({
      connectionId: row.id,
      state: result.error,
      detail: result.detail,
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, result.status, origin, env);
  }
  if (result.body.connected === false) {
    return json({
      connectionId: row.id,
      state: "bridge_unavailable",
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 502, origin, env);
  }
  // Intentionally discard account payload: this endpoint verifies reachability only.
  return json({
    connectionId: row.id,
    state: "data_verified",
    dataVerified: true,
    accountReadSucceeded: true,
    checkedAt: new Date().toISOString(),
    ordersEnabled: false,
    liveTradingEnabled: false
  }, 200, origin, env);
}
async function readAccount(request, env, user, row, origin) {
  const result = await requestMt5Proxy(env, user, row, "/api/account");
  if (!result.ok) {
    return json({
      connectionId: row.id,
      state: result.error,
      detail: result.detail,
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, result.status, origin, env);
  }
  const data = result.body;
  if (data.connected !== true) {
    return json({
      connectionId: row.id,
      state: "bridge_unavailable",
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, 502, origin, env);
  }
  return json({
    connectionId: row.id,
    state: "data_verified",
    dataVerified: true,
    checkedAt: new Date().toISOString(),
    account: {
      connected: true,
      broker: "Exness",
      platform: "MT5",
      environment: "demo",
      server: typeof data.server === "string" ? data.server : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      balance: safeNumber(data.balance),
      equity: safeNumber(data.equity),
      margin: safeNumber(data.margin),
      free_margin: safeNumber(data.free_margin ?? data.margin_free),
      margin_level: safeNumber(data.margin_level),
      mode: "read-only",
      order_submission_enabled: false,
      as_of: typeof data.as_of === "string" ? data.as_of : null
    },
    ordersEnabled: false,
    liveTradingEnabled: false
  }, 200, origin, env);
}
async function readQuotes(request, env, user, row, origin) {
  const url = new URL(request.url);
  const symbol = String(url.searchParams.get("symbol") || "").trim();
  const timeframe = String(url.searchParams.get("timeframe") || "M5").toUpperCase();
  const count = url.searchParams.has("count") ? Number(url.searchParams.get("count")) : 100;
  if (!MT5_SYMBOL.test(symbol)) return json({ error: "valid_mt5_symbol_required" }, 400, origin, env);
  if (!MT5_TIMEFRAMES.has(timeframe)) return json({ error: "unsupported_mt5_timeframe" }, 400, origin, env);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return json({ error: "count_must_be_between_1_and_500" }, 400, origin, env);
  }

  const result = await requestMt5Proxy(env, user, row, "/api/quotes", { symbol, timeframe, count });
  if (!result.ok) {
    return json({
      connectionId: row.id,
      state: result.error,
      detail: result.detail,
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }, result.status, origin, env);
  }
  const data = result.body;
  return json({
    connectionId: row.id,
    state: "data_verified",
    dataVerified: true,
    quote: {
      symbol: typeof data.symbol === "string" ? data.symbol : symbol,
      timeframe: typeof data.timeframe === "string" ? data.timeframe : timeframe,
      digits: safeNumber(data.digits),
      tick: data.tick && typeof data.tick === "object" ? {
        bid: safeNumber(data.tick.bid),
        ask: safeNumber(data.tick.ask),
        last: safeNumber(data.tick.last),
        time: typeof data.tick.time === "string" ? data.tick.time : null
      } : null,
      bars: Array.isArray(data.bars) ? data.bars : [],
      count: Number.isInteger(data.count) ? data.count : (Array.isArray(data.bars) ? data.bars.length : 0),
      mode: "read-only",
      order_submission_enabled: false,
      as_of: typeof data.as_of === "string" ? data.as_of : null
    },
    ordersEnabled: false,
    liveTradingEnabled: false
  }, 200, origin, env);
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
      }, 200, origin, env);
    }

    if (origin && !allowedOrigins(env).has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, origin, env);
    }

    if (url.pathname === "/v1/broker/providers" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      return json({
        providers: listBrokerProviders(),
        selectionAuthority: "system_hub",
        mode: "read-only",
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false
      }, 200, origin, env);
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

    if (url.pathname === "/v1/connections" && (request.method === "GET" || request.method === "POST")) {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      if (request.method === "POST") return createConnection(request, env, auth, origin);
      const result = await queryOwnConnections(env, auth);
      if (!result.ok) return json({ error: result.error }, result.status, origin, env);
      return json({
        connections: result.rows.map(publicConnection),
        count: result.rows.length,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 200, origin, env);
    }

    const match = /^\/v1\/connections\/([^/]+)\/(status|check|account|quotes)$/.exec(url.pathname);
    if (match && (
      (["status", "account", "quotes"].includes(match[2]) && request.method === "GET") ||
      (match[2] === "check" && request.method === "POST")
    )) {
      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ error: auth.error }, auth.status, origin, env);
      const result = await getConnection(request, env, auth, match[1], origin);
      if (result.response) return result.response;
      if (match[2] === "check") return checkConnection(request, env, auth, result.row, origin);
      if (match[2] === "account") {
        if (result.row.status !== "connected" || !result.row.bridge_route_id) return connectionNotReady(result.row, origin, env);
        return readAccount(request, env, auth, result.row, origin);
      }
      if (match[2] === "quotes") {
        if (result.row.status !== "connected" || !result.row.bridge_route_id) return connectionNotReady(result.row, origin, env);
        return readQuotes(request, env, auth, result.row, origin);
      }
      const connection = publicConnection(result.row);
      return json({
        ...connection,
        state: connection.readiness,
        dataVerified: false,
        note: "Status reflects the user's connection record only. Use POST /v1/connections/{id}/check or GET /account to verify the live read-only account path.",
      }, 200, origin, env);
    }

    return json({ error: "not_found" }, 404, origin, env);
  }
};
