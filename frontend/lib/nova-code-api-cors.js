const DEFAULT_ALLOWED_ORIGINS = new Set(["https://voom-studio-ai.base44.app"]);
const CONFIGURED_ALLOWED_ORIGINS = new Set(
  (process.env.NOVA_CODE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...CONFIGURED_ALLOWED_ORIGINS]);

function addVaryOrigin(headers) {
  const values = new Set((headers.get("Vary") || "").split(",").map((value) => value.trim()).filter(Boolean));
  values.add("Origin");
  headers.set("Vary", [...values].join(", "));
}

export function withNovaCodeCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  addVaryOrigin(headers);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Retry-After, X-Request-Id");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function novaCodeApiOptions(request, methods) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
  });
  addVaryOrigin(headers);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "nova_code_origin_not_allowed" }), {
      status: 403,
      headers: { ...Object.fromEntries(headers), "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(null, { status: 204, headers });
}
