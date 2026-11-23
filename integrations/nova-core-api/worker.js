const VERSION = "0.1.0";
const ROLES = new Set(["admin", "operator", "viewer"]);
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function configuredOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(origin, env) {
  if (!origin || !configuredOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Accept",
    "Access-Control-Max-Age": "300",
    "Vary": "Origin",
  };
}

function json(data, status = 200, origin = "", env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      ...corsHeaders(origin, env),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function fail(error, status, origin, env) {
  return json({
    error,
    executionEnabled: false,
    liveTradingEnabled: false,
    brokerWritesEnabled: false,
  }, status, origin, env);
}

function supabaseAuthUrl(env) {
  try {
    const base = new URL(String(env.SUPABASE_URL || ""));
    if (base.protocol !== "https:") return null;
    return new URL("/auth/v1/user", base.origin);
  } catch {
    return null;
  }
}

export async function authenticate(request, env) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "authentication_required" };

  const authUrl = supabaseAuthUrl(env);
  if (!authUrl || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }

  let response;
  try {
    response = await fetch(authUrl, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + match[1],
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }

  // Do not forward a bearer token across redirects, even to a different host.
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: "invalid_or_expired_session" };
  }
  if (!response.ok) {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }

  try {
    const user = await response.json();
    if (!user || typeof user.id !== "string" || !user.id) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    const role = user.app_metadata?.nova_role;
    if (typeof role !== "string" || !ROLES.has(role)) {
      return { ok: false, status: 403, error: "role_not_authorized" };
    }
    return {
      ok: true,
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : null,
        role,
      },
    };
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const origins = configuredOrigins(env);

    if (origin && !origins.has(origin)) {
      return fail("origin_not_allowed", 403, "", env);
    }

    if (request.method === "OPTIONS") {
      if (!origin || !origins.has(origin)) return fail("origin_not_allowed", 403, "", env);
      return new Response(null, {
        status: 204,
        headers: { ...BASE_HEADERS, ...corsHeaders(origin, env) },
      });
    }

    if (request.method !== "GET") {
      return fail("method_not_allowed", 405, origin, env);
    }

    if (url.pathname === "/v1/health") {
      const authConfigured = Boolean(supabaseAuthUrl(env) && env.SUPABASE_PUBLISHABLE_KEY);
      return json({
        status: authConfigured ? "ok" : "degraded",
        service: "nova-core-api",
        version: VERSION,
        dependencies: { supabaseAuthConfigured: authConfigured },
        liveTradingEnabled: false,
        brokerWritesEnabled: false,
      }, 200, origin, env);
    }

    if (url.pathname !== "/v1/me") {
      return fail("not_found", 404, origin, env);
    }

    const auth = await authenticate(request, env);
    if (!auth.ok) return fail(auth.error, auth.status, origin, env);

    return json({
      user: auth.user,
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerWritesEnabled: false,
    }, 200, origin, env);
  },
};
