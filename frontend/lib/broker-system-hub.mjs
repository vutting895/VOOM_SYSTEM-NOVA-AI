const DEFAULT_HUB_URL = "https://voom-system-hub.suwapat787.workers.dev";
const SAFE_MESSAGES = Object.freeze({
  session_rejected: "Supabase session นี้ใช้ไม่ได้แล้ว กรุณาเข้าสู่ระบบใหม่",
  permission_denied: "คำขอถูกปฏิเสธโดยสิทธิ์เจ้าของบัญชี",
  connection_not_found: "ไม่พบบัญชี Exness MT5 Demo ของผู้ใช้ปัจจุบัน",
  pending_provisioning: "รับคำขอแล้ว แต่ยังรอผู้ดูแลจัดสรร MT5 Bridge เฉพาะบัญชี",
  tenant_guard_rejected: "คำขอถูกปฏิเสธโดย Tenant Guard",
  bridge_not_provisioned: "บัญชียังไม่ได้รับการจัดสรร Bridge เฉพาะลูกค้า",
  bridge_or_proxy_unavailable: "MT5 Bridge หรือ Proxy ยังไม่พร้อมใช้งาน",
  bridge_response_timeout: "MT5 Bridge ใช้เวลาตอบสนองเกินกำหนด",
  mt5_proxy_unavailable: "ไม่สามารถตรวจสอบ MT5 ผ่าน Proxy ได้",
});

function safeErrorStatus(status) {
  if (status === 401) return "auth_required";
  if (status === 403) return "permission_denied";
  if (status === 404) return "connection_not_found";
  if (status === 409) return "pending_provisioning";
  return "unavailable";
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value || DEFAULT_HUB_URL);
  } catch {
    throw new TypeError("System Hub URL is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new TypeError("System Hub URL must be a trusted HTTPS origin");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url;
}

export function createBrokerSystemHubClient({
  hubUrl = DEFAULT_HUB_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 9000,
} = {}) {
  const base = normalizeBaseUrl(hubUrl);
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  async function request(path, token, method = "GET") {
    if (typeof token !== "string" || !token.trim() || /\s/.test(token.trim())) {
      return { ok: false, status: 401, error: "authentication_required" };
    }

    let target;
    try {
      target = new URL(path.replace(/^\/+/, ""), base);
      if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
        return { ok: false, status: 400, error: "invalid_hub_path" };
      }
      const response = await fetchImpl(target, {
        method,
        headers: {
          Authorization: "Bearer " + token.trim(),
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: undefined } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => ({}));
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, status: 502, error: "invalid_hub_response" };
      }
      return { ok: response.ok, status: response.status, body };
    } catch {
      // Never surface fetch/provider exception text: it may contain auth headers or URLs.
      return { ok: false, status: 502, error: "system_hub_unavailable" };
    }
  }

  return Object.freeze({
    listConnections: (token) => request("v1/connections", token, "GET"),
    createConnection: (token) => request("v1/connections", token, "POST"),
    checkConnection: (token, connectionId) => {
      if (typeof connectionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) {
        return Promise.resolve({ ok: false, status: 400, error: "valid_connection_id_required" });
      }
      return request("v1/connections/" + encodeURIComponent(connectionId) + "/check", token, "POST");
    },
  });
}

function normalizedResponse(status, detail, connectionId, checkedAt) {
  return {
    broker: "mt5",
    status,
    connected: status === "connected",
    accountConnected: status === "connected",
    detail,
    checkedAt: checkedAt || new Date().toISOString(),
    mode: "read-only",
    environment: "demo",
    tradingEnabled: false,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    ...(connectionId ? { connectionRequestId: connectionId } : {}),
  };
}

function failedHubResponse(result) {
  const code = result.body?.state || result.body?.error || safeErrorStatus(result.status);
  const status = SAFE_MESSAGES[code] ? code : safeErrorStatus(result.status);
  const message = SAFE_MESSAGES[status] || "ไม่สามารถตรวจสอบ System Hub ได้; บัญชียังไม่ถูกยืนยัน";
  const httpStatus = result.status === 401 ? 401
    : result.status === 403 ? 403
      : result.status === 404 ? 404
        : result.status === 409 ? 202 : 503;
  return { status: httpStatus, body: normalizedResponse(status, message) };
}

function validateConnection(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.connectionId === "string" &&
    value.provider === "exness_mt5" &&
    value.environment === "demo" &&
    ["pending", "connected", "disabled"].includes(value.recordStatus) &&
    typeof value.bridgeAllocated === "boolean"
  );
}

export async function readExnessBrokerStatus({
  client,
  accessToken,
  createIfMissing = false,
} = {}) {
  if (!client || typeof client.listConnections !== "function" ||
      typeof client.createConnection !== "function" || typeof client.checkConnection !== "function") {
    return {
      status: 503,
      body: normalizedResponse("unavailable", "Broker Hub client is not configured"),
    };
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      status: 401,
      body: normalizedResponse("auth_required", "กรุณาเข้าสู่ระบบก่อนตรวจสอบบัญชี Exness MT5 Demo"),
    };
  }

  let listed = await client.listConnections(accessToken);
  if (!listed.ok) return failedHubResponse(listed);
  if (!Array.isArray(listed.body?.connections)) {
    return {
      status: 502,
      body: normalizedResponse("unavailable", "System Hub ส่งรายการการเชื่อมต่อในรูปแบบที่ไม่ถูกต้อง"),
    };
  }

  let connection = listed.body.connections.find(
    (item) => item?.provider === "exness_mt5" && item?.environment === "demo",
  ) || null;

  if (!connection && createIfMissing) {
    const created = await client.createConnection(accessToken);
    if (!created.ok) return failedHubResponse(created);
    connection = created.body?.connection || null;
  }

  if (!connection) {
    return {
      status: createIfMissing ? 503 : 200,
      body: normalizedResponse(
        createIfMissing ? "request_failed" : "not_provisioned",
        createIfMissing
          ? "System Hub ยังไม่สามารถสร้างคำขอ Exness MT5 Demo ได้"
          : "ยังไม่มีคำขอ Exness MT5 Demo สำหรับผู้ใช้ปัจจุบัน",
      ),
    };
  }

  if (!validateConnection(connection)) {
    return {
      status: 502,
      body: normalizedResponse("unavailable", "System Hub ส่งข้อมูล connection ที่ไม่ถูกต้อง"),
    };
  }

  if (connection.recordStatus === "disabled") {
    return {
      status: 403,
      body: normalizedResponse("connection_disabled", "การเชื่อมบัญชีนี้ถูกปิดใช้งานโดยผู้ดูแล", connection.connectionId),
    };
  }

  if (connection.recordStatus !== "connected" || connection.bridgeAllocated !== true) {
    return {
      status: 202,
      body: normalizedResponse(
        "pending_provisioning",
        SAFE_MESSAGES.pending_provisioning,
        connection.connectionId,
      ),
    };
  }

  const checked = await client.checkConnection(accessToken, connection.connectionId);
  if (!checked.ok) {
    const failed = failedHubResponse(checked);
    failed.body = normalizedResponse(
      failed.body.status,
      failed.body.detail,
      connection.connectionId,
    );
    return failed;
  }

  const body = checked.body;
  const readOnlyVerified =
    body?.connectionId === connection.connectionId &&
    body?.state === "data_verified" &&
    body?.dataVerified === true &&
    body?.accountReadSucceeded === true &&
    body?.ordersEnabled === false &&
    body?.liveTradingEnabled === false;

  if (!readOnlyVerified) {
    const code = body?.state;
    const message = SAFE_MESSAGES[code] || "การอ่านบัญชีจริงยังไม่ผ่านการยืนยัน; ระบบยังคงปิดการซื้อขาย";
    return {
      status: code === "pending_provisioning" ? 202 : 503,
      body: normalizedResponse(
        code === "pending_provisioning" ? code : "unverified",
        message,
        connection.connectionId,
      ),
    };
  }

  return {
    status: 200,
    body: normalizedResponse(
      "connected",
      "ยืนยัน Exness MT5 Demo ผ่าน System Hub สำเร็จ · Read-only",
      connection.connectionId,
      body.checkedAt,
    ),
  };
}
