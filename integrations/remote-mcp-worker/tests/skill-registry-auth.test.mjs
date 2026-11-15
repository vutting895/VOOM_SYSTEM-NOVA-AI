import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const ENDPOINT = "https://voom-system-mcp.test/mcp";
const ENV = {
  SUPABASE_URL: "https://test.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

function toolRequest(name, args = {}, token = "test-user-token") {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args }
    })
  });
}

async function withSupabaseAuth(responseFactory, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.origin, ENV.SUPABASE_URL);
    assert.equal(url.pathname, "/auth/v1/user");
    return responseFactory(new Headers(init?.headers));
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("authenticated MCP skill listing returns metadata only", async () => {
  await withSupabaseAuth((headers) => {
    assert.equal(headers.get("authorization"), "Bearer test-user-token");
    return new Response(JSON.stringify({ id: "skill-catalog-user" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }, async () => {
    const response = await worker.fetch(
      toolRequest("list_nova_skills", { domain: "trading_research" }),
      ENV
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.isError, false);
    const result = JSON.parse(payload.result.content[0].text);
    assert.equal(result.count, 3);
    assert.ok(result.skills.every((skill) => skill.executionEnabled === false));
    assert.equal(result.policy.executionEnabled, false);
  });
});

test("unauthenticated or expired sessions cannot call MCP skill tools", async () => {
  await withSupabaseAuth((headers) => {
    assert.equal(headers.get("authorization"), "Bearer expired-token");
    return new Response(JSON.stringify({ message: "invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }, async () => {
    const response = await worker.fetch(
      toolRequest("list_nova_skills", {}, "expired-token"),
      ENV
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });

  const response = await worker.fetch(toolRequest("list_nova_skills", {}, null), ENV);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("authenticated MCP skill lookup rejects invalid IDs as tool errors", async () => {
  await withSupabaseAuth(() => new Response(JSON.stringify({ id: "skill-catalog-user" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }), async () => {
    const response = await worker.fetch(
      toolRequest("get_nova_skill", { skill_id: "../secrets" }),
      ENV
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.isError, true);
    assert.match(payload.result.content[0].text, /nova_skill_id_invalid/);
  });
});
