const DEFAULT_ORIGINS = [
  "https://voomsystem.vercel.app",
  "https://voomsystemnova-suwapats-projects.vercel.app",
  "https://voomsystemnova-git-main-suwapats-projects.vercel.app",
  "https://voom-system-nova-ui.suwapat787.workers.dev",
];

function allowedOrigin(origin, env) {
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  return !!origin && [...DEFAULT_ORIGINS, ...configured].includes(origin);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!allowedOrigin(origin, env)) return { "vary": "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, apikey",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && typeof user.id === "string" ? user : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!allowedOrigin(request.headers.get("Origin"), env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "voom-exness-readonly",
        mode: "read-only",
        accountApiAccess: "pending_user_verification",
        accountConnected: false,
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
        timestamp: new Date().toISOString(),
      }, 200, headers);
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed", liveTradingEnabled: false, orderEndpointsEnabled: false }, 405, headers);
    }

    if (url.pathname === "/api/exness/status") {
      const user = await authenticate(request, env);
      if (!user) return json({ error: "unauthorized", message: "Sign in to VOOM_SYSTEM first." }, 401, headers);

      const credentialsConfigured = Boolean(env.EXNESS_API_KEY && env.EXNESS_API_SECRET);
      const apiHostConfigured = Boolean(env.EXNESS_API_BASE_URL);
      return json({
        ok: true,
        broker: "Exness",
        accountType: "MT5",
        userId: user.id,
        mode: "read-only",
        apiAccess: "pending_user_verification",
        credentialsConfigured,
        apiHostConfigured,
        connectionVerified: false,
        accountDataAvailable: false,
        nextStep: credentialsConfigured && apiHostConfigured
          ? "credentials_present_but_official_auth_and_read_endpoint_not_yet_verified"
          : "check_personal_area_api_access_then_configure_worker_secrets",
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
      }, 200, headers);
    }

    if (url.pathname === "/api/exness/account") {
      const user = await authenticate(request, env);
      if (!user) return json({ error: "unauthorized" }, 401, headers);
      return json({
        error: "account_read_not_enabled",
        message: "The official API access, authentication scheme, and read-only account endpoint must be verified before making Exness API calls.",
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
      }, 501, headers);
    }

    return json({ error: "not_found", liveTradingEnabled: false, orderEndpointsEnabled: false }, 404, headers);
  },
};
