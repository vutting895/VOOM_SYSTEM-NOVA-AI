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
  if (!allowedOrigin(origin, env)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, apikey",
    "access-control-max-age": "600",
    vary: "Origin",
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

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToDer(pem) {
  const normalized = pem.replace(/\r/g, "").trim();
  if (!normalized.startsWith("-----BEGIN PRIVATE KEY-----") || !normalized.endsWith("-----END PRIVATE KEY-----")) {
    throw new Error("EXN_PRIVATE_KEY must be a PKCS#8 PEM Ed25519 private key.");
  }
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sha256Base64url(bytes) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function signGet(path, env) {
  const timestamp = Date.now();
  const payload = {
    api_key: env.EXN_API_KEY,
    idempotency_key: "",
    timestamp,
    sign_version: 1,
    method: "GET",
    path,
    body_hash: await sha256Base64url(new Uint8Array()),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.EXN_PRIVATE_KEY),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, payloadBytes));
  return {
    "EXN-API-KEY": env.EXN_API_KEY,
    "EXN-IDEMPOTENCY-KEY": "",
    "EXN-TIMESTAMP": String(timestamp),
    "EXN-SIGN-VERSION": "1",
    "EXN-DATA": base64url(payloadBytes),
    "EXN-SIGN": base64url(signature),
    Accept: "application/json",
  };
}

function apiHost(env) {
  if (!env.EXN_API_BASE_URL) throw new Error("EXN_API_BASE_URL is not configured.");
  const host = new URL(env.EXN_API_BASE_URL);
  if (host.protocol !== "https:" || host.username || host.password || host.search || host.hash) {
    throw new Error("EXN_API_BASE_URL must be a valid HTTPS API host without credentials, query, or fragment.");
  }
  return host.origin;
}

async function getExnessAccount(env) {
  if (!env.EXN_API_KEY || !env.EXN_PRIVATE_KEY || !env.EXN_ACCOUNT_ID) {
    return { ok: false, status: 503, body: { error: "exness_readonly_config_missing", message: "Read-only Exness API configuration is incomplete." } };
  }
  if (!/^\d{1,20}$/.test(env.EXN_ACCOUNT_ID)) {
    return { ok: false, status: 503, body: { error: "exness_account_id_invalid", message: "The configured account identifier is invalid." } };
  }
  const path = `/v1/configuration/accounts/${env.EXN_ACCOUNT_ID}/account`;
  try {
    const headers = await signGet(path, env);
    const response = await fetch(new URL(path, apiHost(env)), { method: "GET", headers, signal: AbortSignal.timeout(10000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof body?.code === "number" ? body.code : undefined;
      return {
        ok: false,
        status: response.status === 429 ? 429 : 502,
        body: {
          error: "exness_readonly_request_failed",
          upstreamStatus: response.status,
          upstreamCode: code,
          message: response.status === 401 ? "Exness rejected the API key or signature. Check key format and signing setup in the Worker." :
            response.status === 403 ? "Exness denied access. Check Info/read-only scope, selected account, and allowed IP restrictions." :
            response.status === 404 ? "Exness could not find the account or API path." :
            response.status === 429 ? "Exness API rate limit reached; wait before retrying." :
            "Exness did not return account details. No trading request was sent.",
          liveTradingEnabled: false,
          orderEndpointsEnabled: false,
        },
      };
    }
    const settings = body?.settings || {};
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        broker: "Exness",
        accountType: "MT5",
        mode: "read-only",
        connectionVerified: true,
        accountDataAvailable: true,
        account: {
          accountId: String(body.account_id || env.EXN_ACCOUNT_ID),
          accountName: typeof body.account_name === "string" ? body.account_name : null,
          createdAt: typeof body.create_date === "string" ? body.create_date : null,
          currency: typeof settings.currency === "string" ? settings.currency : null,
          leverage: typeof settings.leverage === "string" ? settings.leverage : null,
          tradeMode: typeof settings.trade_mode === "string" ? settings.trade_mode : null,
          accountStatus: typeof settings.account_status === "string" ? settings.account_status : null,
          executionMode: typeof settings.execution_mode === "string" ? settings.execution_mode : null,
        },
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const configError = message.includes("EXN_PRIVATE_KEY") || message.includes("EXN_API_BASE_URL");
    return {
      ok: false,
      status: configError ? 503 : 502,
      body: {
        error: configError ? "exness_readonly_config_invalid" : "exness_readonly_request_error",
        message: configError ? message : "The read-only request could not be completed. Check Worker configuration and runtime support; no trading request was sent.",
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
      },
    };
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

      return json({
        ok: true,
        broker: "Exness",
        accountType: "MT5",
        mode: "read-only",
        apiAccess: "key_management_seen_user_report",
        credentialsConfigured: Boolean(env.EXN_API_KEY && env.EXN_PRIVATE_KEY && env.EXN_ACCOUNT_ID),
        apiHostConfigured: Boolean(env.EXN_API_BASE_URL),
        connectionVerified: false,
        accountDataAvailable: false,
        nextStep: "run_explicit_read_only_account_test",
        liveTradingEnabled: false,
        orderEndpointsEnabled: false,
      }, 200, headers);
    }

    if (url.pathname === "/api/exness/account") {
      const user = await authenticate(request, env);
      if (!user) return json({ error: "unauthorized", message: "Sign in to VOOM_SYSTEM first." }, 401, headers);
      const result = await getExnessAccount(env);
      return json(result.body, result.status, headers);
    }

    return json({ error: "not_found", liveTradingEnabled: false, orderEndpointsEnabled: false }, 404, headers);
  },
};
