import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const ENDPOINT = "https://voom-system-mcp.test/mcp";
const UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
const MODERN = "2026-07-28";
const VERSION_META = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";

function makeModernRequest({
  method = "server/discover",
  params = {},
  versionHeader = MODERN,
  metadataVersion = MODERN,
  includeVersionHeader = true,
  methodHeader = method,
  includeMethodHeader = true,
  nameHeader,
  includeNameHeader = true,
  clientInfo = { name: "contract-test-client", version: "1.0.0" },
  includeClientInfo = true,
  clientCapabilities = {},
  id = 1,
  includeId = true,
  origin,
  accept = "application/json, text/event-stream",
  contentType = "application/json"
} = {}) {
  const metadata = {};
  if (metadataVersion !== undefined) metadata[VERSION_META] = metadataVersion;
  if (includeClientInfo && clientInfo !== undefined) metadata[CLIENT_INFO] = clientInfo;
  if (clientCapabilities !== undefined) metadata[CLIENT_CAPABILITIES] = clientCapabilities;
  const headers = {
    "Content-Type": contentType,
    "Accept": accept
  };
  if (includeVersionHeader) headers["MCP-Protocol-Version"] = versionHeader;
  if (includeMethodHeader) headers["Mcp-Method"] = methodHeader;
  if (method === "tools/call" && includeNameHeader) {
    headers["Mcp-Name"] = nameHeader ?? params.name;
  } else if (includeNameHeader && nameHeader !== undefined) {
    headers["Mcp-Name"] = nameHeader;
  }
  if (origin) headers.Origin = origin;
  const requestParams = { ...params, _meta: metadata };
  const payload = { jsonrpc: "2.0", method, params: requestParams };
  if (includeId) payload.id = id;
  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
}

function makeLegacyRequest() {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" }
    })
  });
}

async function withAuthenticatedUser(request, run = () => worker.fetch(request, {
  SUPABASE_URL: "https://contract-test.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
})) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-user-token");
    return new Response(JSON.stringify({ id: "mcp-modern-contract-test-user" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function responseFor(request) {
  return withAuthenticatedUser(request, () => worker.fetch(request, {
    SUPABASE_URL: "https://contract-test.supabase.invalid",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
  }));
}

function bearerRequest(request) {
  const headers = new Headers(request.headers);
  headers.set("Authorization", "Bearer test-user-token");
  return new Request(request, { headers });
}

test("modern server/discover returns per-request discovery metadata and read-only capabilities", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest()));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.resultType, "complete");
  assert.ok(payload.result.supportedVersions.includes(MODERN));
  assert.deepEqual(payload.result.capabilities, { tools: {} });
  assert.equal(payload.result._meta[SERVER_INFO].name, "voom-system-mcp");
  assert.equal(payload.result.cacheScope, "private");
  assert.equal(payload.result.ttlMs, 60000);
});

test("modern tools/list returns complete result with private cache metadata", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest({ method: "tools/list" })));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.resultType, "complete");
  assert.ok(Array.isArray(payload.result.tools));
  assert.equal(payload.result.cacheScope, "private");
  assert.equal(payload.result._meta[SERVER_INFO].version, "0.3.0");
});

test("modern tools/call returns a complete read-only tool result", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest({
    method: "tools/call",
    params: { name: "system_status", arguments: {} }
  })));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.resultType, "complete");
  assert.equal(payload.result.isError, false);
  const textResult = JSON.parse(payload.result.content[0].text);
  assert.equal(textResult.mode, "authenticated-read-only");
  assert.equal(textResult.liveTradingEnabled, false);
  assert.equal(textResult.executionEnabled, false);
});

test("rejects missing modern protocol header when body metadata claims modern protocol", async () => {
  const request = bearerRequest(makeModernRequest({ includeVersionHeader: false }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32020);
});

test("rejects protocol header/body version mismatch", async () => {
  const request = bearerRequest(makeModernRequest({ versionHeader: "2025-03-26" }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32020);
});

test("rejects missing or mismatched Mcp-Method header", async () => {
  const missing = await responseFor(bearerRequest(makeModernRequest({ includeMethodHeader: false })));
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, -32020);

  const mismatch = await responseFor(bearerRequest(makeModernRequest({ methodHeader: "tools/call" })));
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error.code, -32020);
});

test("rejects Mcp-Name when it does not match tools/call params.name", async () => {
  const request = bearerRequest(makeModernRequest({
    method: "tools/call",
    params: { name: "system_status", arguments: {} },
    nameHeader: "mt5_account_summary"
  }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32020);
});

test("accepts modern requests when optional clientInfo is omitted", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest({ includeClientInfo: false })));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.supportedVersions.includes(MODERN), true);
});

test("rejects malformed optional clientInfo and missing required clientCapabilities", async () => {
  const malformed = await responseFor(bearerRequest(makeModernRequest({ clientInfo: null })));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32602);

  const missingCapabilities = await responseFor(bearerRequest(makeModernRequest({ clientCapabilities: null })));
  assert.equal(missingCapabilities.status, 400);
  assert.equal((await missingCapabilities.json()).error.code, -32602);
});

test("accepts a modern notification without an id using HTTP 202 and an empty body", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest({
    method: "notifications/cancelled",
    params: { requestId: 12, reason: "test" },
    includeId: false
  })));
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "");
});

test("rejects a notification that incorrectly includes an id", async () => {
  const response = await responseFor(bearerRequest(makeModernRequest({
    method: "notifications/cancelled",
    params: { requestId: 12 },
    includeId: true
  })));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32600);
});

test("unsupported protocol versions return supported versions with code -32022", async () => {
  const request = bearerRequest(makeModernRequest({
    versionHeader: "2099-01-01",
    metadataVersion: "2099-01-01"
  }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  const error = (await response.json()).error;
  assert.equal(error.code, -32022);
  assert.deepEqual(error.data.supported, [MODERN, "2025-03-26"]);
  assert.equal(error.data.supported.includes("2024-11-05"), false);
});

test("modern method-not-found is HTTP 404 and retains JSON-RPC code -32601", async () => {
  const request = bearerRequest(makeModernRequest({ method: "not/implemented" }));
  const response = await responseFor(request);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, -32601);
});

test("legacy initialize remains compatible with protocol 2025-03-26", async () => {
  const response = await responseFor(bearerRequest(makeLegacyRequest()));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.protocolVersion, "2025-03-26");
  assert.deepEqual(payload.result.capabilities, { tools: {} });
});

test("rejects a modern request that does not advertise both supported response media types", async () => {
  const request = bearerRequest(makeModernRequest({ accept: "application/json" }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32600);
});

test("rejects a modern request with a non-JSON Content-Type", async () => {
  const request = bearerRequest(makeModernRequest({ contentType: "text/plain" }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32600);
});

test("decodes the MCP base64 sentinel for Mcp-Name before comparing it to body params", async () => {
  const request = bearerRequest(makeModernRequest({
    method: "tools/call",
    params: { name: "system_status", arguments: {} },
    nameHeader: "=?base64?c3lzdGVtX3N0YXR1cw==?="
  }));
  const response = await responseFor(request);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.resultType, "complete");
  assert.equal(payload.result.isError, false);
});

test("trusted browser preflight allows the required modern MCP request headers", async () => {
  const response = await worker.fetch(new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: {
      Origin: UI_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,accept,mcp-protocol-version,mcp-method,mcp-name"
    }
  }), {});
  assert.equal(response.status, 204);
  const allowedHeaders = String(response.headers.get("Access-Control-Allow-Headers") || "").toLowerCase();
  assert.ok(allowedHeaders.includes("mcp-protocol-version"));
  assert.ok(allowedHeaders.includes("mcp-method"));
  assert.ok(allowedHeaders.includes("mcp-name"));
});

test("legacy initialize rejects the unsupported HTTP+SSE protocol rather than silently downgrading", async () => {
  const request = bearerRequest(new Request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" }
    })
  }));
  const response = await responseFor(request);
  assert.equal(response.status, 400);
  const error = (await response.json()).error;
  assert.equal(error.code, -32022);
  assert.deepEqual(error.data.supported, [MODERN, "2025-03-26"]);
});
