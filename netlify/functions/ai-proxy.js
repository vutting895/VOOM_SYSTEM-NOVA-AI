import { json, methodNotAllowed, getBearer } from "../lib/system-hub.js";

const WORKER = "https://voom-system-nova-ai.suwapat787.workers.dev";
const TARGETS = Object.freeze({
  chat: { path: "/api/chat", method: "POST" },
  generate: { path: "/api/gen-ai/generate", method: "POST" },
  marketplace: { path: "/api/marketplace", method: "GET" },
  backtest: { path: "/api/backtest", method: "POST" }
});

export const handler = async (event) => {
  const target = TARGETS[String(event.queryStringParameters?.target || "")];
  if (!target) return json(404, { error: "ai_route_not_found" });
  if (event.httpMethod !== target.method) return methodNotAllowed([target.method]);
  const token = getBearer(event);
  if (!token) return json(401, { error: "authentication_required" });

  let body;
  if (target.method === "POST") {
    if (typeof event.body !== "string" || !event.body) return json(400, { error: "request_body_required" });
    body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    if (Buffer.byteLength(body, "utf8") > 16 * 1024) return json(413, { error: "request_too_large" });
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "invalid_json_object" });
    } catch {
      return json(400, { error: "invalid_json" });
    }
  }

  try {
    const response = await fetch(WORKER + target.path, {
      method: target.method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.text();
    return {
      statusCode: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      },
      body: payload
    };
  } catch {
    return json(502, { error: "nova_ai_worker_unavailable", executionEnabled: false, liveTradingEnabled: false });
  }
};
