const INCIDENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAFE_ERROR_CODES = new Set([
  "route_render_failed",
  "component_render_failed",
  "network_request_failed",
  "request_timeout",
  "service_unavailable",
  "authentication_required",
  "access_denied",
  "unknown_client_error"
]);

export function createIncidentId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (typeof randomUUID === "function") {
    const value = randomUUID();
    if (INCIDENT_ID_PATTERN.test(value)) return value;
  }
  return "incident-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function classifyClientError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return "request_timeout";
  if (name === "TypeError") return "network_request_failed";
  return "unknown_client_error";
}

export function sanitizeIncident(input = {}) {
  const candidateCode = SAFE_ERROR_CODES.has(input.errorCode) ? input.errorCode : "unknown_client_error";
  const route = typeof input.route === "string" ? input.route.split("?")[0].split("#")[0] : "/";
  const safeRoute = route.startsWith("/") && !route.startsWith("//") && route.length <= 120
    ? route.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\/{2,}/g, "/")
    : "/";
  const component = typeof input.component === "string" && /^[a-zA-Z0-9._-]{1,60}$/.test(input.component)
    ? input.component
    : "unknown";
  const attempt = Number.isInteger(input.attempt) ? Math.max(0, Math.min(input.attempt, 3)) : 0;

  return {
    incidentId: typeof input.incidentId === "string" && INCIDENT_ID_PATTERN.test(input.incidentId)
      ? input.incidentId
      : createIncidentId(),
    errorCode: candidateCode,
    route: safeRoute,
    component,
    attempt,
    occurredAt: new Date().toISOString()
  };
}

export function reportClientIncident(input) {
  const incident = sanitizeIncident(input);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nova:client-incident", { detail: incident }));
  }
  return incident;
}
