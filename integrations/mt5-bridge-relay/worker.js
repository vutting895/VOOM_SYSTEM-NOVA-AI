const BASE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const ALLOWED_READ_PATHS = new Set(["/health", "/api/account", "/api/symbols", "/api/quotes"]);
const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const MAX_MESSAGE_BYTES = 1024 * 1024;
const RESPONSE_TIMEOUT_MS = 7200;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...BASE, "Content-Type": "application/json; charset=utf-8" }
  });
}

export function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : "";
}

function parseRouteMap(value) {
  if (!value) return {};
  try {
    const routes = JSON.parse(value);
    return routes && typeof routes === "object" && !Array.isArray(routes) ? routes : null;
  } catch {
    return null;
  }
}

export function authorizeBridge(request, env) {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, error: "authentication_required" };

  const tenantId = (request.headers.get("X-VOOM-TENANT-ID") || "").trim();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    return { ok: false, status: 403, error: "tenant_mismatch" };
  }
  if (!env.MT5_TENANT_ROUTES && !env.MT5_TENANT_ROUTES_ADDITIONAL) {
    return { ok: false, status: 503, error: "tenant_route_map_not_configured" };
  }

  const primaryRoutes = parseRouteMap(env.MT5_TENANT_ROUTES);
  const additionalRoutes = parseRouteMap(env.MT5_TENANT_ROUTES_ADDITIONAL);
  if (primaryRoutes === null || additionalRoutes === null) {
    return { ok: false, status: 503, error: "tenant_route_map_invalid" };
  }

  const inPrimary = Object.hasOwn(primaryRoutes, tenantId);
  const inAdditional = Object.hasOwn(additionalRoutes, tenantId);
  if (inPrimary && inAdditional) {
    return { ok: false, status: 503, error: "tenant_route_map_conflict" };
  }
  const route = inPrimary ? primaryRoutes[tenantId] : additionalRoutes[tenantId];
  if (
    !route ||
    route.tenantId !== tenantId ||
    typeof route.token !== "string" ||
    route.token.length < 32
  ) {
    return { ok: false, status: 403, error: "tenant_route_not_provisioned" };
  }
  if (!constantTimeEqual(route.token, token)) {
    return { ok: false, status: 401, error: "invalid_bridge_token" };
  }
  return { ok: true, tenantId };
}

function singleParam(url, name) {
  const values = url.searchParams.getAll(name);
  return values.length <= 1 ? (values[0] ?? null) : undefined;
}

export function validateReadRequest(url) {
  if (!ALLOWED_READ_PATHS.has(url.pathname)) {
    return { ok: false, error: "read_path_not_allowed" };
  }

  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: "duplicate_query_parameter" };
  }

  if (url.pathname === "/health" || url.pathname === "/api/account") {
    return keys.length === 0 ? { ok: true } : { ok: false, error: "query_not_allowed" };
  }

  const allowedKeys = url.pathname === "/api/symbols"
    ? new Set(["q", "limit"])
    : new Set(["symbol", "timeframe", "count"]);
  if (keys.some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: "query_parameter_not_allowed" };
  }

  if (url.pathname === "/api/symbols") {
    const q = singleParam(url, "q");
    const limit = singleParam(url, "limit");
    if (q === undefined || (q !== null && q.length > 40)) {
      return { ok: false, error: "invalid_symbol_filter" };
    }
    if (limit !== null && (limit === undefined || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 500)) {
      return { ok: false, error: "invalid_limit" };
    }
    return { ok: true };
  }

  const symbol = singleParam(url, "symbol");
  const timeframe = singleParam(url, "timeframe");
  const count = singleParam(url, "count");
  if (symbol === undefined || symbol === null || !/^[A-Za-z0-9._-]{1,40}$/.test(symbol)) {
    return { ok: false, error: "invalid_symbol" };
  }
  if (timeframe === undefined || (timeframe !== null && !TIMEFRAMES.has(timeframe.toUpperCase()))) {
    return { ok: false, error: "invalid_timeframe" };
  }
  if (count !== null && (count === undefined || !/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 500)) {
    return { ok: false, error: "invalid_count" };
  }
  return { ok: true };
}

function unavailable(error, status = 503) {
  return json({
    error,
    mode: "read-only",
    order_submission_enabled: false,
    liveTradingEnabled: false,
    ordersEnabled: false
  }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "voom-mt5-bridge-relay",
        status: "relay_ready",
        bridgeSession: "tenant_scoped",
        mode: "read-only",
        order_submission_enabled: false,
        liveTradingEnabled: false,
        ordersEnabled: false
      });
    }

    if (url.pathname === "/connect") {
      if (request.method !== "GET") return unavailable("method_not_allowed", 405);
      if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return unavailable("websocket_upgrade_required", 426);
      }
      const auth = authorizeBridge(request, env);
      if (!auth.ok) return unavailable(auth.error, auth.status);
      if (!env.BRIDGE_SESSIONS) return unavailable("bridge_session_binding_not_configured");
      const id = env.BRIDGE_SESSIONS.idFromName(auth.tenantId);
      return env.BRIDGE_SESSIONS.get(id).fetch(request);
    }

    if (/\/(orders?|trades?|execute|withdraw|transfer)(\/|$)/i.test(url.pathname)) {
      return unavailable("forbidden", 403);
    }
    if (!ALLOWED_READ_PATHS.has(url.pathname)) return unavailable("not_found", 404);
    if (request.method !== "GET") return unavailable("method_not_allowed", 405);

    const auth = authorizeBridge(request, env);
    if (!auth.ok) return unavailable(auth.error, auth.status);

    const validation = validateReadRequest(url);
    if (!validation.ok) return unavailable(validation.error, 400);
    if (!env.BRIDGE_SESSIONS) return unavailable("bridge_session_binding_not_configured");

    const id = env.BRIDGE_SESSIONS.idFromName(auth.tenantId);
    const stub = env.BRIDGE_SESSIONS.get(id);
    const internalUrl = new URL("https://bridge-session.internal" + url.pathname + url.search);
    const internalRequest = new Request(internalUrl, {
      method: "GET",
      headers: {
        "X-Relay-Internal": "1",
        "X-VOOM-TENANT-ID": auth.tenantId,
        "Accept": "application/json"
      }
    });
    return stub.fetch(internalRequest);
  }
};

export class BridgeSession {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if ((request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      const auth = authorizeBridge(request, this.env);
      if (!auth.ok) return unavailable(auth.error, auth.status);

      for (const socket of this.ctx.getWebSockets()) {
        try { socket.close(1012, "replaced_by_new_connection"); } catch {}
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ tenantId: auth.tenantId, connectedAt: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.headers.get("X-Relay-Internal") !== "1") {
      return unavailable("internal_route_only", 403);
    }
    if (request.method !== "GET") return unavailable("method_not_allowed", 405);
    const validation = validateReadRequest(url);
    if (!validation.ok) return unavailable(validation.error, 400);

    const tenantId = request.headers.get("X-VOOM-TENANT-ID") || "";
    const socket = this.ctx.getWebSockets().find((item) => {
      if (item.readyState !== 1) return false;
      try {
        return item.deserializeAttachment()?.tenantId === tenantId;
      } catch {
        return false;
      }
    });
    if (!socket) return unavailable("bridge_not_connected", 503);

    const id = crypto.randomUUID();
    const payload = JSON.stringify({
      type: "request",
      id,
      method: "GET",
      path: url.pathname + url.search
    });
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve(unavailable("bridge_response_timeout", 504));
      }, RESPONSE_TIMEOUT_MS);
      this.pending.set(id, { resolve, timeout, socket, tenantId });
      try {
        socket.send(payload);
      } catch {
        clearTimeout(timeout);
        this.pending.delete(id);
        resolve(unavailable("bridge_send_failed", 503));
      }
    });
  }

  webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;
    let data;
    try { data = JSON.parse(message); } catch { return; }
    if (data?.type !== "response" || typeof data.id !== "string") return;

    const pending = this.pending.get(data.id);
    if (!pending || pending.socket !== socket) return;
    if (
      !Number.isInteger(data.status) ||
      data.status < 200 ||
      data.status > 599 ||
      data.status === 101 ||
      typeof data.body !== "string" ||
      new TextEncoder().encode(data.body).byteLength > MAX_MESSAGE_BYTES
    ) {
      clearTimeout(pending.timeout);
      this.pending.delete(data.id);
      pending.resolve(unavailable("invalid_bridge_response", 502));
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(data.id);
    pending.resolve(new Response(data.body, {
      status: data.status,
      headers: {
        ...BASE,
        "Content-Type": "application/json; charset=utf-8"
      }
    }));
  }

  webSocketClose(socket) {
    this.failPendingForSocket(socket);
  }

  webSocketError(socket) {
    this.failPendingForSocket(socket);
  }

  failPendingForSocket(socket) {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.socket !== socket) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      pending.resolve(unavailable("bridge_disconnected", 503));
    }
  }
}
