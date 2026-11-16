const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

// Deliberately hard-coded off. Environment variables and request payloads cannot enable execution.
const CAPABILITIES = Object.freeze({
  ordersEnabled: false,
  executionEnabled: false,
  liveTradingEnabled: false
});

function json(data, status = 200) {
  return new Response(JSON.stringify({ ...data, ...CAPABILITIES }), { status, headers: BASE_HEADERS });
}

function serviceStatus() {
  return { service: "nova-execution-service", state: "disabled", implementation: "contract-stub", orderSubmission: "not_implemented" };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ...serviceStatus(), health: "ok" });
    }
    if (request.method === "GET" && url.pathname === "/v1/trading/execution/status") {
      return json({ ...serviceStatus(), acceptedIntents: false });
    }
    if (request.method === "POST" && url.pathname === "/v1/trading/intents") {
      // Do not parse or persist untrusted model/client input while execution is unimplemented.
      return json({ error: "execution_disabled", state: "not_executed", message: "NOVA execution is not implemented or enabled." }, 503);
    }
    const intentMatch = /^\\/v1\\/trading\\/intents\\/([A-Za-z0-9_-]{1,80})$/.exec(url.pathname);
    if (request.method === "GET" && intentMatch) {
      return json({ error: "intent_store_not_configured", state: "unavailable", intentId: intentMatch[1] }, 503);
    }
    return json({ error: "not_found" }, 404);
  }
};
