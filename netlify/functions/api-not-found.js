import { json } from "../lib/system-hub.js";

export const handler = async (event) => {
  const route = String(event.queryStringParameters?.path || "").slice(0, 180);
  return json(501, {
    error: "API_ROUTE_NOT_IMPLEMENTED",
    route: route ? "/api/" + route : null,
    detail: "This API route has no verified backend implementation and will not return mock data.",
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false
  });
};
