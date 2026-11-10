const UI_ORIGINS = new Set([
  "https://voomsystem.netlify.app",
  "https://voom-system-nova-ui.suwapat787.workers.dev"
]);
const RELAY_ORIGIN = "https://voom-mt5-bridge-relay.suwapat787.workers.dev";
const BASE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const cors = (origin) => UI_ORIGINS.has(origin) ? {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "300",
  "Vary": "Origin"
} : {};
const json = (value, status = 200, origin = "") => new Response(JSON.stringify(value), {
  status,
  headers: { ...BASE, "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
});
const allowed = new Set(["/health", "/api/account", "/api/symbols", "/api/quotes", "/api/profit-calculation"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
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
  return "MT5 Proxy could not reach Supabase Auth; errorName=" + errorName + "; message=" + message;
}

function supabaseApiKey(env) {
  return env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };
  if (!env.SUPABASE_URL || !supabaseApiKey(env)) {
    return { ok: false, status: 503, error: "auth_service_not_configured" };
  }

  let authUrl;
  try {
    const baseUrl = new URL(env.SUPABASE_URL);
    if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
      return { ok: false, status: 503, error: "auth_service_not_configured" };
    }
    authUrl = new URL("/auth/v1/user", baseUrl);
  } catch {
    return { ok: false, status: 503, error: "auth_service_not_configured" };
  }

  const authInit = {
    method: "GET",
    headers: {
      apikey: supabaseApiKey(env),
      Authorization: "Bearer " + token,
      Accept: "application/json"
    },
    cache: "no-store",
    // Inspect redirects explicitly so credentials are never sent to another origin.
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  };
  let response;
  try {
    response = await fetch(authUrl, authInit);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) return { ok: false, status: 503, error: "auth_service_unavailable" };
      let redirectedUrl;
      try {
        redirectedUrl = new URL(location, authUrl);
      } catch {
        return { ok: false, status: 503, error: "auth_service_unavailable" };
      }
      if (redirectedUrl.protocol !== "https:" || redirectedUrl.origin !== authUrl.origin) {
        return { ok: false, status: 503, error: "auth_service_unavailable" };
      }
      response = await fetch(redirectedUrl, authInit);
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, status: 503, error: "auth_service_unavailable" };
      }
    }
  } catch (error) {
    console.warn(safeAuthDiagnostic(error));
    return { ok: false, status: 503, error: "auth_service_unavailable" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: "invalid_or_expired_session" };
  }
  if (!response.ok) {
    console.warn("MT5 Proxy Supabase Auth returned non-success; status=" + response.status);
    return { ok: false, status: 503, error: "auth_service_unavailable" };
  }
  try {
    const user = await response.json();
    return user && typeof user.id === "string" && user.id
      ? { ok: true, userId: user.id, token }
      : { ok: false, status: 401, error: "invalid_or_expired_session" };
  } catch {
    return { ok: false, status: 503, error: "auth_service_unavailable" };
  }
}

async function loadConnection(request, env, user) {
  const connectionId = new URL(request.url).searchParams.get("connection_id") || "";
  if (!uuid.test(connectionId)) return { ok: false, status: 400, error: "valid_connection_id_required" };

  const url = new URL(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/broker_connections");
  url.searchParams.set("select", "id,user_id,provider,environment,status,bridge_route_id");
  url.searchParams.set("id", "eq." + connectionId);
  url.searchParams.set("user_id", "eq." + user.userId);

  try {
    const response = await fetch(url, {
      headers: {
        apikey: supabaseApiKey(env),
        Authorization: "Bearer " + user.token,
        Accept: "application/json"
      },
      cache: "no-store",
      // Do not automatically forward the user's bearer token across redirects.
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return { ok: false, status: 503, error: "connection_lookup_unavailable" };
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { ok: false, status: 404, error: "connection_not_found" };
    if (row.provider !== "exness_mt5" || row.environment !== "demo") {
      return { ok: false, status: 403, error: "broker_or_environment_not_allowed" };
    }
    if (row.status !== "connected" || !row.bridge_route_id) {
      return { ok: false, status: 409, error: "connection_not_provisioned" };
    }

    let routes;
    try {
      routes = JSON.parse(env.MT5_TENANT_ROUTES || "{}");
    } catch {
      return { ok: false, status: 503, error: "tenant_route_map_invalid" };
    }
    const route = routes?.[row.bridge_route_id];
    if (
      !route ||
      typeof route.token !== "string" ||
      route.token.length < 32 ||
      route.tenantId !== row.bridge_route_id
    ) {
      return { ok: false, status: 503, error: "dedicated_bridge_not_provisioned" };
    }

    // Ignore legacy per-tenant URLs. All bridge traffic now uses the stable Worker relay;
    // no custom DNS zone or public Windows origin is involved.
    return {
      ok: true,
      route: { url: RELAY_ORIGIN, token: route.token, tenantId: route.tenantId }
    };
  } catch {
    return { ok: false, status: 503, error: "connection_lookup_unavailable" };
  }
}

function validateProfitCalculationQuery(url) {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return { ok: false, error: "duplicate_query_parameter" };
  const allowed = new Set(["connection_id", "symbol", "side", "volume", "open_price", "stop_price"]);
  if (keys.some((key) => !allowed.has(key))) return { ok: false, error: "query_parameter_not_allowed" };
  for (const key of ["connection_id", "symbol", "side", "volume", "open_price", "stop_price"]) {
    if (!url.searchParams.get(key)) return { ok: false, error: "missing_" + key };
  }
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(url.searchParams.get("symbol"))) {
    return { ok: false, error: "invalid_symbol" };
  }
  const side = url.searchParams.get("side").toLowerCase();
  if (side !== "buy" && side !== "sell") return { ok: false, error: "invalid_side" };
  const numbers = {};
  for (const key of ["volume", "open_price", "stop_price"]) {
    const raw = url.searchParams.get(key);
    if (raw.length > 32 || !/^\d+(?:\.\d+)?$/.test(raw)) {
      return { ok: false, error: "invalid_" + key };
    }
    numbers[key] = Number(raw);
    if (!Number.isFinite(numbers[key]) || numbers[key] <= 0) {
      return { ok: false, error: "invalid_" + key };
    }
  }
  if ((side === "buy" && numbers.stop_price >= numbers.open_price) ||
      (side === "sell" && numbers.stop_price <= numbers.open_price)) {
    return { ok: false, error: "stop_price_must_represent_loss" };
  }
  return { ok: true };
}


async function forward(request, route, path, origin) {
  const url = new URL(request.url);
  const target = new URL(path, route.url);
  for (const key of ["q", "limit", "symbol", "timeframe", "count", "side", "volume", "open_price", "stop_price"]) {
    const value = url.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value.slice(0, 120));
  }

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + route.token,
        "X-VOOM-TENANT-ID": route.tenantId,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        ...BASE,
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        ...cors(origin)
      }
    });
  } catch {
    return json({
      error: "dedicated_bridge_unavailable",
      mode: "read-only",
      order_submission_enabled: false,
      ordersEnabled: false
    }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!UI_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: BASE });
      return new Response(null, { status: 204, headers: { ...BASE, ...cors(origin) } });
    }
    if (request.method === "GET" && url.pathname === "/health" && !url.searchParams.has("connection_id")) {
      return json({
        ok: true,
        service: "voom-mt5-readonly-proxy",
        mode: "read-only",
        customerAuthenticationRequired: true,
        ordersEnabled: false,
        liveTradingEnabled: false
      }, 200, origin);
    }
    if (!allowed.has(url.pathname)) {
      return json({ error: "not_found", ordersEnabled: false, liveTradingEnabled: false }, 404, origin);
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed", mode: "read-only", ordersEnabled: false }, 405, origin);
    }
    if (url.pathname === "/api/profit-calculation") {
      const validation = validateProfitCalculationQuery(url);
      if (!validation.ok) return json({ error: validation.error, mode: "read-only" }, 400, origin);
    }

    const user = await authenticate(request, env);
    if (!user.ok) return json({
      error: user.error,
      mode: "read-only",
      ordersEnabled: false,
      liveTradingEnabled: false
    }, user.status, origin);

    const connection = await loadConnection(request, env, user);
    if (!connection.ok) return json({
      error: connection.error,
      mode: "read-only",
      ordersEnabled: false,
      liveTradingEnabled: false
    }, connection.status, origin);

    return forward(request, connection.route, url.pathname === "/health" ? "/health" : url.pathname, origin);
  }
};
