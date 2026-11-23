import { importJWK, jwtVerify } from "jose";

const VERSION = "0.2.2";
const ROLE_LEVEL = Object.freeze({ viewer: 1, operator: 2, admin: 3 });
const jwksCache = new Map();
const JWKS_TTL_MS = 5 * 60 * 1000;
const MAX_JWKS_BYTES = 65536;
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function configuredOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean));
}

function corsHeaders(origin, env) {
  if (!origin || !configuredOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Accept",
    "Access-Control-Max-Age": "300",
    Vary: "Origin",
  };
}

function json(data, status = 200, origin = "", env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, ...corsHeaders(origin, env), "Content-Type": "application/json; charset=utf-8" },
  });
}

function fail(error, status, origin, env) {
  return json({ error, executionEnabled: false, liveTradingEnabled: false, brokerWritesEnabled: false }, status, origin, env);
}

function supabaseConfig(env) {
  try {
    const base = new URL(String(env.SUPABASE_URL || ""));
    if (base.protocol !== "https:") return null;
    return {
      issuer: new URL("/auth/v1", base.origin).toString().replace(/\/$/, ""),
      jwksUrl: new URL("/auth/v1/.well-known/jwks.json", base.origin),
    };
  } catch {
    return null;
  }
}

async function readBoundedJson(response) {
  const contentLength = Number(response.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JWKS_BYTES) {
    throw new Error("jwks_response_too_large");
  }
  if (!response.body) throw new Error("empty_jwks_response");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JWKS_BYTES) {
        await reader.cancel();
        throw new Error("jwks_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function loadJwks(url, forceRefresh = false) {
  const cacheKey = url.toString();
  const cached = jwksCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("jwks_provider_unavailable");

  const document = await readBoundedJson(response);
  if (!document || !Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 20) {
    throw new Error("invalid_jwks_document");
  }

  const imported = new Map();
  for (const jwk of document.keys) {
    if (!jwk || typeof jwk.kid !== "string" || !jwk.kid ||
        (jwk.use && jwk.use !== "sig") ||
        (jwk.key_ops && !jwk.key_ops.includes("verify")) ||
        !["RS256", "ES256"].includes(jwk.alg)) continue;
    try {
      imported.set(jwk.kid + ":" + jwk.alg, await importJWK(jwk, jwk.alg));
    } catch {
      // Ignore unusable keys; the requested key must still match below.
    }
  }
  jwksCache.set(cacheKey, { keys: imported, expiresAt: Date.now() + JWKS_TTL_MS });
  return imported;
}

async function authProviderReady(env) {
  const config = supabaseConfig(env);
  if (!config) return false;
  try {
    const keys = await loadJwks(config.jwksUrl);
    return keys.size > 0;
  } catch {
    return false;
  }
}

async function resolveSigningKey(url, header) {
  if (!header || typeof header.kid !== "string" || !["RS256", "ES256"].includes(header.alg)) {
    throw Object.assign(new Error("invalid_signing_key_header"), { code: "ERR_JWKS_NO_MATCHING_KEY" });
  }
  let keys = await loadJwks(url);
  let key = keys.get(header.kid + ":" + header.alg);
  if (!key) {
    keys = await loadJwks(url, true);
    key = keys.get(header.kid + ":" + header.alg);
  }
  if (!key) throw Object.assign(new Error("signing_key_not_found"), { code: "ERR_JWKS_NO_MATCHING_KEY" });
  return key;
}

export async function authenticate(request, env) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "authentication_required" };

  const config = supabaseConfig(env);
  if (!config) return { ok: false, status: 503, error: "authentication_not_configured" };

  try {
    const { payload } = await jwtVerify(match[1], (header) => resolveSigningKey(config.jwksUrl, header), {
      issuer: config.issuer,
      audience: "authenticated",
      algorithms: ["RS256", "ES256"],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    const role = payload.app_metadata?.nova_role;
    if (typeof role !== "string" || !Object.hasOwn(ROLE_LEVEL, role)) {
      return { ok: false, status: 403, error: "role_not_authorized" };
    }
    return {
      ok: true,
      user: {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
        role,
      },
    };
  } catch (error) {
    if (error?.code === "ERR_JWT_EXPIRED" || error?.code === "ERR_JWS_INVALID" ||
        error?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" || error?.code === "ERR_JWKS_NO_MATCHING_KEY" ||
        error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || error?.code === "ERR_JWT_INVALID") {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const origins = configuredOrigins(env);

    if (origin && !origins.has(origin)) return fail("origin_not_allowed", 403, "", env);

    if (request.method === "OPTIONS") {
      if (!origin || !origins.has(origin)) return fail("origin_not_allowed", 403, "", env);
      return new Response(null, { status: 204, headers: { ...BASE_HEADERS, ...corsHeaders(origin, env) } });
    }
    if (request.method !== "GET") return fail("method_not_allowed", 405, origin, env);

    if (url.pathname === "/v1/health") {
      const providerReady = await authProviderReady(env);
      return json({
        status: providerReady ? "ok" : "degraded",
        version: VERSION,
        time: new Date().toISOString(),
        liveTrading: false,
        brokerWrites: false,
      }, 200, origin, env);
    }

    if (url.pathname !== "/v1/me") return fail("not_found", 404, origin, env);

    const auth = await authenticate(request, env);
    if (!auth.ok) return fail(auth.error, auth.status, origin, env);
    if (ROLE_LEVEL[auth.user.role] < ROLE_LEVEL.viewer) {
      return fail("insufficient_role", 403, origin, env);
    }
    return json({
      id: auth.user.id,
      email: auth.user.email,
      role: auth.user.role,
      executionEnabled: false,
      liveTradingEnabled: false,
      brokerWritesEnabled: false,
    }, 200, origin, env);
  },
};
