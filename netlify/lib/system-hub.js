const DEFAULT_HUB_URL = "https://voom-system-hub.suwapat787.workers.dev";
const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body: JSON.stringify(payload)
  };
}

export function methodNotAllowed(methods) {
  return json(405, { error: "method_not_allowed", allowedMethods: methods });
}

export function getBearer(event) {
  const headers = event.headers || {};
  const value = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(\S+)$/i.exec(String(value));
  return match ? match[1] : "";
}

function hubBaseUrl() {
  const value = String(process.env.NOVA_SYSTEM_HUB_URL || DEFAULT_HUB_URL).trim();
  let url;
  try { url = new URL(value); } catch { throw new Error("system_hub_url_invalid"); }
  if (url.protocol !== "https:" || url.hostname !== "voom-system-hub.suwapat787.workers.dev" ||
      url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("system_hub_url_not_allowlisted");
  }
  return url;
}

export async function publicHubRequest(pathname) {
  let url;
  try {
    if (typeof pathname !== "string" || !pathname.startsWith("/v1/public/") || pathname.includes("..")) {
      throw new Error("system_hub_path_invalid");
    }
    url = new URL(pathname, hubBaseUrl());
  } catch (error) {
    return { ok: false, response: json(503, { error: error.message || "system_hub_not_configured" }) };
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, response: json(response.status === 503 ? 503 : 502, {
      error: typeof payload.error === "string" ? payload.error : "public_system_hub_request_failed"
    }) };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, response: json(502, { error: "system_hub_unavailable" }) };
  }
}

export async function hubRequest(event, pathname, { method = "GET", body } = {}) {
  const token = getBearer(event);
  if (!token) return { ok: false, response: json(401, { error: "authentication_required" }) };
  let url;
  try {
    if (typeof pathname !== "string" || !pathname.startsWith("/v1/") || pathname.includes("..")) {
      throw new Error("system_hub_path_invalid");
    }
    url = new URL(pathname, hubBaseUrl());
  } catch (error) {
    return { ok: false, response: json(503, { error: error.message || "system_hub_not_configured" }) };
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: "Bearer " + token,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(9000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = [400, 401, 403, 404, 409, 429].includes(response.status) ? response.status : 502;
      return { ok: false, response: json(status, {
        error: typeof payload.error === "string" ? payload.error : "system_hub_request_failed",
        state: typeof payload.state === "string" ? payload.state : undefined,
        dataVerified: payload.dataVerified === true ? true : false,
        ordersEnabled: false,
        liveTradingEnabled: false
      }) };
    }
    return { ok: true, data: payload };
  } catch {
    return { ok: false, response: json(502, { error: "system_hub_unavailable", ordersEnabled: false, liveTradingEnabled: false }) };
  }
}

export async function resolveDemoConnection(event) {
  const result = await hubRequest(event, "/v1/connections");
  if (!result.ok) return result;
  const rows = Array.isArray(result.data.connections) ? result.data.connections : [];
  const requested = String(event.queryStringParameters?.connection_id || "");
  if (requested && !CONNECTION_ID.test(requested)) {
    return { ok: false, response: json(400, { error: "valid_connection_id_required" }) };
  }
  const connection = rows.find((row) =>
    row && row.provider === "exness_mt5" &&
    row.environment === "demo" &&
    row.status === "connected" &&
    CONNECTION_ID.test(String(row.connectionId || "")) &&
    (!requested || row.connectionId === requested)
  );
  if (!connection) {
    return { ok: false, response: json(409, {
      error: "exness_demo_connection_not_ready",
      state: "pending_or_unverified",
      dataVerified: false,
      ordersEnabled: false,
      liveTradingEnabled: false
    }) };
  }
  return { ok: true, connection };
}

export function normalizeMt5Symbol(value, fallback = "XAUUSDm") {
  const symbol = String(value || fallback).trim().replaceAll("/", "");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(symbol)) throw new Error("invalid_symbol");
  return symbol;
}

export function normalizeTimeframe(value, fallback = "M5") {
  const raw = String(value || fallback).trim().toUpperCase();
  const map = { "1M": "M1", "5M": "M5", "15M": "M15", "30M": "M30", "1H": "H1", "4H": "H4", "1D": "D1" };
  const result = map[raw] || raw;
  if (!["M1", "M5", "M15", "M30", "H1", "H4", "D1"].includes(result)) throw new Error("unsupported_timeframe");
  return result;
}
