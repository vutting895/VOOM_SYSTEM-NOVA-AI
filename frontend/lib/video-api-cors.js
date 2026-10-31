const ALLOWED_ORIGINS = new Set(
  (process.env.NOVA_VIDEO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function varyOrigin(headers) {
  const current = headers.get("Vary");
  const values = new Set((current || "").split(",").map((value) => value.trim()).filter(Boolean));
  values.add("Origin");
  headers.set("Vary", [...values].join(", "));
}

export function withVideoCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  varyOrigin(headers);

  // Bearer-token authentication is used; cookies and credentialed CORS are not enabled.
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Retry-After");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function videoApiOptions(request, methods) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
  });
  varyOrigin(headers);

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "video_origin_not_allowed" }), {
      status: 403,
      headers: { ...Object.fromEntries(headers), "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(null, { status: 204, headers });
}
