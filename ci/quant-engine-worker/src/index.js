const RESPONSE = {
  service: "nova-quant-ci-pilot",
  purpose: "quant-engine-ci-preview",
  trading: {
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
  },
};

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    return Response.json(RESPONSE, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
