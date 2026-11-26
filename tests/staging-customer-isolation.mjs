import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hub from "../integrations/system-hub/worker.js";
import proxy from "../integrations/mt5-readonly-proxy/worker.js";

const SUPABASE_ORIGIN = "https://supabase.test";
const HUB_ENV = {
  SUPABASE_URL: SUPABASE_ORIGIN,
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};
const PROXY_ENV = {
  SUPABASE_URL: SUPABASE_ORIGIN,
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  MT5_TENANT_ROUTES: "{}"
};
const CONNECTION_A = "00000000-0000-4000-8000-000000000001";
const sessions = new Map([
  ["customer-a-session", "customer-a"],
  ["customer-b-session", "customer-b"]
]);
let connections = [];
let relayCalls = 0;
const originalFetch = globalThis.fetch;

function bearer(init) {
  return new Headers(init?.headers || {}).get("Authorization") || "";
}

beforeEach(() => {
  connections = [];
  relayCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const authorization = bearer(init);

    if (url.origin === SUPABASE_ORIGIN && url.pathname === "/auth/v1/user") {
      const userId = sessions.get(authorization.replace(/^Bearer\s+/, ""));
      return userId
        ? Response.json({ id: userId })
        : Response.json({ message: "invalid session" }, { status: 401 });
    }

    if (url.origin === SUPABASE_ORIGIN && url.pathname === "/rest/v1/nova_broker_connections") {
      const token = authorization.replace(/^Bearer\s+/, "");
      const userId = sessions.get(token);
      assert.ok(userId, "REST access must use a known customer session");
      if (init.method === "POST") {
        const row = {
          id: CONNECTION_A,
          user_id: userId,
          provider: "exness_mt5",
          environment: "demo",
          status: "pending",
          account_label: "Exness MT5 Demo",
          bridge_route_id: null
        };
        connections.push(row);
        return Response.json([row], { status: 201 });
      }
      const requestedOwner = url.searchParams.get("user_id");
      const requestedId = url.searchParams.get("id");
      return Response.json(connections.filter((row) =>
        requestedOwner === "eq." + userId &&
        row.user_id === userId &&
        (!requestedId || requestedId === "eq." + row.id)
      ));
    }

    if (url.origin === "https://voom-mt5-bridge-relay.suwapat787.workers.dev") {
      relayCalls += 1;
      throw new Error("A foreign customer's connection must never reach the bridge relay");
    }
    throw new Error("Unexpected outbound request: " + url.origin + url.pathname);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("System Hub isolates connection creation, listing, and status by customer session", async () => {
  const created = await hub.fetch(new Request("https://hub.test/v1/connections", {
    method: "POST",
    headers: { Authorization: "Bearer customer-a-session", "Content-Type": "application/json" },
    body: JSON.stringify({})
  }), HUB_ENV);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.connection.connectionId, CONNECTION_A);
  assert.equal(createdBody.connection.ordersEnabled, false);
  assert.equal(createdBody.connection.liveTradingEnabled, false);

  const customerBList = await hub.fetch(new Request("https://hub.test/v1/connections", {
    headers: { Authorization: "Bearer customer-b-session" }
  }), HUB_ENV);
  assert.equal(customerBList.status, 200);
  const listBody = await customerBList.json();
  assert.equal(listBody.count, 0);
  assert.deepEqual(listBody.connections, []);

  const customerBForeignStatus = await hub.fetch(new Request(
    "https://hub.test/v1/connections/" + CONNECTION_A + "/status",
    { headers: { Authorization: "Bearer customer-b-session" } }
  ), HUB_ENV);
  assert.equal(customerBForeignStatus.status, 404);
  assert.equal((await customerBForeignStatus.json()).error, "connection_not_found");
});

test("MT5 read-only Proxy rejects a foreign connection before bridge forwarding", async () => {
  connections = [{
    id: CONNECTION_A,
    user_id: "customer-a",
    provider: "exness_mt5",
    environment: "demo",
    status: "connected",
    bridge_route_id: "tenant-a"
  }];

  const response = await proxy.fetch(new Request(
    "https://proxy.test/api/account?connection_id=" + CONNECTION_A,
    { headers: { Authorization: "Bearer customer-b-session" } }
  ), PROXY_ENV);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "connection_not_found");
  assert.equal(relayCalls, 0);
});

test("Hub and Proxy reject requests without a customer session", async () => {
  const hubResponse = await hub.fetch(new Request("https://hub.test/v1/connections"), HUB_ENV);
  assert.equal(hubResponse.status, 401);

  const proxyResponse = await proxy.fetch(new Request(
    "https://proxy.test/api/account?connection_id=" + CONNECTION_A
  ), PROXY_ENV);
  assert.equal(proxyResponse.status, 401);
});
