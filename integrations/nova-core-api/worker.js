const VERSION = "0.2.5";
const ROLE_LEVEL = Object.freeze({ viewer: 1, operator: 2, admin: 3 });
const jwksCache = new Map();
const JWKS_TTL_MS = 5 * 60 * 1000;
const MAX_JWKS_BYTES = 65536;
const CLOCK_TOLERANCE_SECONDS = 5;
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
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return {
      issuer: new URL("/auth/v1", base.origin).toString().replace(/\/$/, ""),
      jwksUrl: new URL("/auth/v1/.well-known/jwks.json", base.origin),
    };
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtJson(value) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value)));
}

async function readBoundedJson(response) {
  const contentLength = Number(response.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JWKS_BYTES) throw new Error("jwks_response_too_large");
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

async function importVerificationKey(jwk, alg) {
  if (!jwk || typeof jwk.kid !== "string" || !jwk.kid ||
      (jwk.use && jwk.use !== "sig") ||
      (jwk.key_ops && !jwk.key_ops.includes("verify")) ||
      (jwk.alg && jwk.alg !== alg)) throw new Error("invalid_jwk");

  if (alg === "RS256" && jwk.kty === "RSA") {
    return crypto.subtle.importKey("jwk", jwk, {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    }, false, ["verify"]);
  }
  if (alg === "ES256" && jwk.kty === "EC" && jwk.crv === "P-256") {
    return crypto.subtle.importKey("jwk", jwk, {
      name: "ECDSA",
      namedCurve: "P-256",
    }, false, ["verify"]);
  }
  throw new Error("unsupported_jwk_algorithm");
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
  let importErrorName = null;
  for (const jwk of document.keys) {
    for (const alg of ["RS256", "ES256"]) {
      try {
        const key = await importVerificationKey(jwk, alg);
        imported.set(jwk.kid + ":" + alg, key);
      } catch (error) {
        importErrorName = typeof error?.name === "string" ? error.name : "Error";
      }
    }
  }
  jwksCache.set(cacheKey, { keys: imported, importErrorName, expiresAt: Date.now() + JWKS_TTL_MS });
  return imported;
}

async function authProviderStatus(env) {
  const config = supabaseConfig(env);
  if (!config) return { ready: false, reason: "invalid_supabase_url", keyCount: 0 };
  try {
    const keys = await loadJwks(config.jwksUrl);
    const diagnostic = jwksCache.get(config.jwksUrl.toString());
    return {
      ready: keys.size > 0,
      reason: keys.size > 0 ? null : diagnostic?.importErrorName ? "jwks_key_import_failed" : "no_usable_signing_keys",
      keyCount: keys.size,
      importErrorName: keys.size > 0 ? null : diagnostic?.importErrorName || null,
      providerErrorName: null,
      providerError: null,
    };
  } catch (error) {
    const allowed = new Set(["jwks_provider_unavailable", "jwks_response_too_large", "empty_jwks_response", "invalid_jwks_document"]);
    const reason = allowed.has(error?.message) ? error.message : "jwks_provider_error";
    const safeMessage = typeof error?.message === "string"
      ? error.message.replace(/https?:\\/\\/[^/\\s]+/g, "[supabase-origin]").replace(/[A-Za-z0-9_-]{64,}/g, "[redacted]").slice(0, 100)
      : "unknown";
    return {
      ready: false,
      reason,
      keyCount: 0,
      importErrorName: null,
      providerErrorName: typeof error?.name === "string" ? error.name : "Error",
      providerError: safeMessage,
    };
  }
}

async function verifyJwt(token, config) {
  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("invalid_jwt"), { code: "ERR_JWT_INVALID" });

  const header = decodeJwtJson(parts[0]);
  const payload = decodeJwtJson(parts[1]);
  if (!header || typeof header !== "object" || !["RS256", "ES256"].includes(header.alg) ||
      typeof header.kid !== "string" || !header.kid || header.crit !== undefined || header.b64 === false) {
    throw Object.assign(new Error("invalid_jwt_header"), { code: "ERR_JWT_INVALID" });
  }

  let keys = await loadJwks(config.jwksUrl);
  let key = keys.get(header.kid + ":" + header.alg);
  if (!key) {
    keys = await loadJwks(config.jwksUrl, true);
    key = keys.get(header.kid + ":" + header.alg);
  }
  if (!key) throw Object.assign(new Error("signing_key_not_found"), { code: "ERR_JWKS_NO_MATCHING_KEY" });

  const signature = decodeBase64Url(parts[2]);
  if (header.alg === "ES256" && signature.byteLength !== 64) {
    throw Object.assign(new Error("invalid_signature"), { code: "ERR_JWS_INVALID" });
  }
  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = header.alg === "RS256"
    ? await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data)
    : await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, data);
  if (!valid) throw Object.assign(new Error("invalid_signature"), { code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" });

  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      payload.iss !== config.issuer ||
      !(payload.aud === "authenticated" || (Array.isArray(payload.aud) && payload.aud.includes("authenticated"))) ||
      typeof payload.exp !== "number" || payload.exp <= now - CLOCK_TOLERANCE_SECONDS ||
      (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now + CLOCK_TOLERANCE_SECONDS)) ||
      typeof payload.sub !== "string" || !payload.sub) {
    throw Object.assign(new Error("invalid_claims"), { code: "ERR_JWT_CLAIM_VALIDATION_FAILED" });
  }
  return payload;
}

export async function authenticate(request, env) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "authentication_required" };

  const config = supabaseConfig(env);
  if (!config) return { ok: false, status: 503, error: "authentication_not_configured" };

  try {
    const payload = await verifyJwt(match[1], config);
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
      const provider = await authProviderStatus(env);
      return json({
        status: provider.ready ? "ok" : "degraded",
        providerReason: provider.reason,
        jwksKeyCount: provider.keyCount,
        jwksImportError: provider.importErrorName,
        providerErrorName: provider.providerErrorName || null,
        providerError: provider.providerError || null,
        version: VERSION,
        time: new Date().toISOString(),
        liveTrading: false,
        brokerWrites: false,
      }, 200, origin, env);
    }

    if (url.pathname !== "/v1/me") return fail("not_found", 404, origin, env);

    const auth = await authenticate(request, env);
    if (!auth.ok) return fail(auth.error, auth.status, origin, env);
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
