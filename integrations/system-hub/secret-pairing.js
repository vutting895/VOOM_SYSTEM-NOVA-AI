const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PAIRING_TTL_MS = 110 * 1000;
const PUBLIC_FIELDS = "id,owner_id,purpose,status,expires_at,created_at,scanned_at,approved_at";

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function hashToken(token) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function supabaseOrigin(env) {
  try {
    const url = new URL(String(env.SUPABASE_URL || ""));
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    return url.origin;
  } catch {
    return "";
  }
}

async function supabaseRequest(env, user, path, init = {}) {
  const origin = supabaseOrigin(env);
  if (!origin || !env.SUPABASE_PUBLISHABLE_KEY) return { ok: false, status: 503, rows: [] };
  let response;
  try {
    response = await fetch(new URL(path, origin), {
      ...init,
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + user.token,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {})
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { ok: false, status: 503, rows: [] };
  }
  if (response.status >= 300 && response.status < 400) return { ok: false, status: 503, rows: [] };
  if (!response.ok) return { ok: false, status: response.status, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, status: response.status, rows: Array.isArray(rows) ? rows : [] };
}

async function readBody(request) {
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return null;
  const raw = await request.text();
  if (raw.length > 2048) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function result(status, body) {
  return { status, body: { ...body, ordersEnabled: false, executionEnabled: false, liveTradingEnabled: false } };
}

function safeRow(row) {
  return {
    pairingId: row.id,
    purpose: row.purpose,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    scannedAt: row.scanned_at || null,
    approvedAt: row.approved_at || null
  };
}

async function createPairing(request, env, user) {
  const token = await createToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + PAIRING_TTL_MS).toISOString();
  const url = new URL("/rest/v1/secret_pairing_sessions", supabaseOrigin(env));
  url.searchParams.set("select", PUBLIC_FIELDS);
  const saved = await supabaseRequest(env, user, url.pathname + url.search, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      owner_id: user.userId,
      purpose: "provider_connection",
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt
    })
  });
  const row = saved.rows[0];
  if (!saved.ok || !row?.id) return result(503, { error: "pairing_creation_unavailable" });

  // The token is returned once and appears only in the URL fragment, never in an HTTP request URL.
  const pairingUrl = "https://voomsystem.netlify.app/connect#pair=" + encodeURIComponent(token);
  return result(201, {
    pairing: safeRow(row),
    pairingToken: token,
    pairingUrl,
    tokenDelivery: "one-time-response-only",
    credentialIntakeEnabled: false,
    secretStorageEnabled: false
  });
}

async function claimPairing(request, env, user) {
  const body = await readBody(request);
  if (!body || typeof body.token !== "string" || !TOKEN_PATTERN.test(body.token)) {
    return result(400, { error: "valid_pairing_token_required" });
  }
  const tokenHash = await hashToken(body.token);
  const now = new Date().toISOString();
  const url = new URL("/rest/v1/secret_pairing_sessions", supabaseOrigin(env));
  for (const [key, value] of Object.entries({
    select: PUBLIC_FIELDS,
    owner_id: "eq." + user.userId,
    token_hash: "eq." + tokenHash,
    status: "eq.pending",
    expires_at: "gt." + now
  })) url.searchParams.set(key, value);
  const updated = await supabaseRequest(env, user, url.pathname + url.search, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "scanned", scanned_at: now })
  });
  if (!updated.ok) return result(503, { error: "pairing_claim_unavailable" });
  if (!updated.rows[0]) return result(409, { error: "pairing_invalid_expired_used_or_not_owned" });
  return result(200, { pairing: safeRow(updated.rows[0]), approvalRequired: true });
}

async function approvePairing(request, env, user, pairingId) {
  const body = await readBody(request);
  if (!body || typeof body.token !== "string" || !TOKEN_PATTERN.test(body.token)) {
    return result(400, { error: "valid_pairing_token_required" });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pairingId)) {
    return result(400, { error: "valid_pairing_id_required" });
  }
  const tokenHash = await hashToken(body.token);
  const now = new Date().toISOString();
  const url = new URL("/rest/v1/secret_pairing_sessions", supabaseOrigin(env));
  for (const [key, value] of Object.entries({
    select: PUBLIC_FIELDS,
    id: "eq." + pairingId,
    owner_id: "eq." + user.userId,
    token_hash: "eq." + tokenHash,
    status: "eq.scanned",
    expires_at: "gt." + now
  })) url.searchParams.set(key, value);
  const updated = await supabaseRequest(env, user, url.pathname + url.search, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "approved", approved_at: now, token_hash: null })
  });
  if (!updated.ok) return result(503, { error: "pairing_approval_unavailable" });
  if (!updated.rows[0]) return result(409, { error: "pairing_invalid_expired_used_or_not_owned" });
  return result(200, {
    pairing: safeRow(updated.rows[0]),
    approved: true,
    credentialIntakeEnabled: false,
    secretStorageEnabled: false,
    nextStep: "provider_credential_flow_not_enabled"
  });
}

async function getPairing(env, user, pairingId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pairingId)) {
    return result(400, { error: "valid_pairing_id_required" });
  }
  const url = new URL("/rest/v1/secret_pairing_sessions", supabaseOrigin(env));
  for (const [key, value] of Object.entries({
    select: PUBLIC_FIELDS,
    id: "eq." + pairingId,
    owner_id: "eq." + user.userId,
    limit: "1"
  })) url.searchParams.set(key, value);
  const found = await supabaseRequest(env, user, url.pathname + url.search);
  if (!found.ok) return result(503, { error: "pairing_lookup_unavailable" });
  if (!found.rows[0]) return result(404, { error: "pairing_not_found" });
  const row = found.rows[0];
  if (row.status === "pending" || row.status === "scanned") {
    if (Date.parse(row.expires_at) <= Date.now()) {
      return result(200, { pairing: { ...safeRow(row), status: "expired" } });
    }
  }
  return result(200, { pairing: safeRow(row) });
}

export async function handleSecretPairingRequest(request, env, user) {
  const url = new URL(request.url);
  if (url.pathname === "/v1/secrets/pairings" && request.method === "POST") {
    return createPairing(request, env, user);
  }
  if (url.pathname === "/v1/secrets/pairings/claim" && request.method === "POST") {
    return claimPairing(request, env, user);
  }
  const match = /^\/v1\/secrets\/pairings\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  if (request.method === "GET") return getPairing(env, user, match[1]);
  if (request.method === "POST") return approvePairing(request, env, user, match[1]);
  return result(405, { error: "method_not_allowed" });
}
