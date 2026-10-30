import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrokerSystemHubClient,
  readExnessBrokerStatus,
} from "./broker-system-hub.mjs";

const HUB = "https://hub.test";
const TOKEN = "user-session-token";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000123";

function readyConnection(overrides = {}) {
  return {
    connectionId: CONNECTION_ID,
    provider: "exness_mt5",
    environment: "demo",
    recordStatus: "connected",
    bridgeAllocated: true,
    ...overrides,
  };
}

function verifiedBody(overrides = {}) {
  return {
    connectionId: CONNECTION_ID,
    state: "data_verified",
    dataVerified: true,
    accountReadSucceeded: true,
    checkedAt: "2026-10-31T00:00:00.000Z",
    ordersEnabled: false,
    liveTradingEnabled: false,
    ...overrides,
  };
}

function fakeClient({
  connections = [readyConnection()],
  check = { ok: true, status: 200, body: verifiedBody() },
  created = null,
} = {}) {
  const calls = [];
  return {
    calls,
    async listConnections(token) {
      calls.push(["list", token]);
      return { ok: true, status: 200, body: { connections } };
    },
    async createConnection(token) {
      calls.push(["create", token]);
      return created || { ok: true, status: 201, body: { connection: readyConnection({ recordStatus: "pending", bridgeAllocated: false }) } };
    },
    async checkConnection(token, id) {
      calls.push(["check", token, id]);
      return check;
    },
  };
}

test("Hub client uses only the fixed HTTPS System Hub origin and forwards the signed-in bearer", async () => {
  const calls = [];
  const client = createBrokerSystemHubClient({
    hubUrl: HUB,
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), init });
      return Response.json({ connections: [] });
    },
  });
  await client.listConnections(TOKEN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, HUB);
  assert.equal(calls[0].url.pathname, "/v1/connections");
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + TOKEN);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.cache, "no-store");
});

test("Hub client rejects non-HTTPS configured origins and does not use caller-controlled URL", () => {
  assert.throws(() => createBrokerSystemHubClient({ hubUrl: "http://hub.test" }), /HTTPS/);
  assert.throws(() => createBrokerSystemHubClient({ hubUrl: "https://user:pass@hub.test" }), /HTTPS/);
});

test("Hub client requires bearer before making network request", async () => {
  let calls = 0;
  const client = createBrokerSystemHubClient({
    hubUrl: HUB,
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  const response = await client.listConnections("");
  assert.deepEqual(response, { ok: false, status: 401, error: "authentication_required" });
  assert.equal(calls, 0);
});

test("Hub client rejects malformed connection ID before check request", async () => {
  let calls = 0;
  const client = createBrokerSystemHubClient({
    hubUrl: HUB,
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  const response = await client.checkConnection(TOKEN, "not-a-uuid");
  assert.equal(response.error, "valid_connection_id_required");
  assert.equal(calls, 0);
});

test("System Hub fetch failure returns a sanitized error without exposing token or exception", async () => {
  const client = createBrokerSystemHubClient({
    hubUrl: HUB,
    fetchImpl: async () => { throw new Error("Bearer secret-session-value"); },
  });
  const response = await client.listConnections(TOKEN);
  assert.deepEqual(response, { ok: false, status: 502, error: "system_hub_unavailable" });
});

test("missing connection is not reported connected and GET does not create it", async () => {
  const client = fakeClient({ connections: [] });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "not_provisioned");
  assert.equal(response.body.accountConnected, false);
  assert.equal(response.body.ordersEnabled, false);
  assert.deepEqual(client.calls, [["list", TOKEN]]);
});

test("POST path creates only a pending Exness Demo request and does not claim connected", async () => {
  const client = fakeClient({
    connections: [],
    created: {
      ok: true,
      status: 201,
      body: { connection: readyConnection({ recordStatus: "pending", bridgeAllocated: false }) },
    },
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN, createIfMissing: true });
  assert.equal(response.status, 202);
  assert.equal(response.body.status, "pending_provisioning");
  assert.equal(response.body.accountConnected, false);
  assert.equal(response.body.executionEnabled, false);
  assert.deepEqual(client.calls, [["list", TOKEN], ["create", TOKEN]]);
});

test("pending connection does not call live check", async () => {
  const client = fakeClient({
    connections: [readyConnection({ recordStatus: "pending", bridgeAllocated: false })],
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 202);
  assert.equal(response.body.status, "pending_provisioning");
  assert.equal(client.calls.length, 1);
});

test("disabled connection fails closed without a Hub check", async () => {
  const client = fakeClient({
    connections: [readyConnection({ recordStatus: "disabled", bridgeAllocated: false })],
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 403);
  assert.equal(response.body.status, "connection_disabled");
  assert.equal(client.calls.length, 1);
});

test("connected account becomes connected only after a successful data-verified Hub account read", async () => {
  const client = fakeClient();
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "connected");
  assert.equal(response.body.accountConnected, true);
  assert.equal(response.body.connectionRequestId, CONNECTION_ID);
  assert.equal(response.body.ordersEnabled, false);
  assert.equal(response.body.executionEnabled, false);
  assert.equal(response.body.liveTradingEnabled, false);
  assert.deepEqual(client.calls, [["list", TOKEN], ["check", TOKEN, CONNECTION_ID]]);
});

test("connected database row without allocated tenant route remains pending", async () => {
  const client = fakeClient({
    connections: [readyConnection({ bridgeAllocated: false })],
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 202);
  assert.equal(response.body.status, "pending_provisioning");
  assert.equal(client.calls.length, 1);
});

test("Hub check cannot report connected when data verification or account read is false", async () => {
  const client = fakeClient({
    check: { ok: true, status: 200, body: verifiedBody({ accountReadSucceeded: false }) },
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 503);
  assert.equal(response.body.status, "unverified");
  assert.equal(response.body.accountConnected, false);
});

test("Hub check cannot enable orders or Live Trading", async () => {
  const client = fakeClient({
    check: { ok: true, status: 200, body: verifiedBody({ ordersEnabled: true }) },
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 503);
  assert.equal(response.body.status, "unverified");
  assert.equal(response.body.ordersEnabled, false);
  assert.equal(response.body.liveTradingEnabled, false);
});

test("foreign or malformed connection metadata fails closed", async () => {
  const client = fakeClient({
    connections: [readyConnection({ provider: "binance" })],
  });
  const response = await readExnessBrokerStatus({ client, accessToken: TOKEN });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "not_provisioned");
  assert.equal(client.calls.length, 1);
});

test("invalid access token is rejected before Hub operations", async () => {
  const client = fakeClient();
  const response = await readExnessBrokerStatus({ client, accessToken: "" });
  assert.equal(response.status, 401);
  assert.equal(response.body.status, "auth_required");
  assert.equal(client.calls.length, 0);
});

test("every API shape explicitly keeps execution and trading disabled", async () => {
  for (const scenario of [
    { client: fakeClient({ connections: [] }), token: TOKEN },
    { client: fakeClient({ connections: [readyConnection({ recordStatus: "pending", bridgeAllocated: false })] }), token: TOKEN },
    { client: fakeClient(), token: TOKEN },
    { client: fakeClient(), token: "" },
  ]) {
    const response = await readExnessBrokerStatus({ client: scenario.client, accessToken: scenario.token });
    assert.equal(response.body.tradingEnabled, false);
    assert.equal(response.body.ordersEnabled, false);
    assert.equal(response.body.executionEnabled, false);
    assert.equal(response.body.liveTradingEnabled, false);
  }
});
