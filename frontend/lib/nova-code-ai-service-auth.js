import { createHash, timingSafeEqual } from "node:crypto";

export const NOVA_CODE_BASE44_APP_ID = "6ae5de7da764c8825610ef62";

function tokenMatches(expected, supplied) {
  if (typeof expected !== "string" || typeof supplied !== "string") return false;
  if (expected.length < 32 || expected.length > 4096 || supplied.length > 4096) return false;
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

/** Authenticate the one approved Base44 server-side caller. */
export function authenticateNovaCodeServiceRequest(request) {
  const appId = request.headers.get("x-nova-client-app-id");
  if (appId === null) return { attempted: false, ok: false };

  if (appId !== NOVA_CODE_BASE44_APP_ID) {
    return { attempted: true, ok: false, status: 403, error: "nova_code_client_app_not_allowed" };
  }

  const configuredToken = process.env.NOVA_CODE_BASE44_SERVICE_TOKEN;
  const tenantId = process.env.NOVA_CODE_BASE44_TENANT_ID;
  if (!configuredToken || configuredToken.length < 32 || configuredToken.length > 4096 || !tenantId) {
    return { attempted: true, ok: false, status: 503, error: "nova_code_service_auth_not_configured" };
  }

  const match = /^Bearer\\s+(\\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!match || !tokenMatches(configuredToken, match[1])) {
    return { attempted: true, ok: false, status: 401, error: "nova_code_service_auth_invalid" };
  }

  return {
    attempted: true,
    ok: true,
    identity: { kind: "service", appId: NOVA_CODE_BASE44_APP_ID, tenantId },
  };
}
