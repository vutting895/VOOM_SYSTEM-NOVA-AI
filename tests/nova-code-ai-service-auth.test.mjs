import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateNovaCodeServiceRequest,
  NOVA_CODE_BASE44_APP_ID,
} from "../frontend/lib/nova-code-ai-service-auth.js";

const saved = {
  token: process.env.NOVA_CODE_BASE44_SERVICE_TOKEN,
  tenant: process.env.NOVA_CODE_BASE44_TENANT_ID,
};
const validToken = "test-only-service-token-with-at-least-32-characters";

function configure(token = validToken, tenant = "tenant-test-001") {
  process.env.NOVA_CODE_BASE44_SERVICE_TOKEN = token;
  process.env.NOVA_CODE_BASE44_TENANT_ID = tenant;
}
function restore() {
  if (saved.token === undefined) delete process.env.NOVA_CODE_BASE44_SERVICE_TOKEN;
  else process.env.NOVA_CODE_BASE44_SERVICE_TOKEN = saved.token;
  if (saved.tenant === undefined) delete process.env.NOVA_CODE_BASE44_TENANT_ID;
  else process.env.NOVA_CODE_BASE44_TENANT_ID = saved.tenant;
}
function makeRequest(appId = NOVA_CODE_BASE44_APP_ID, token = validToken) {
  return new Request("https://nova.example/api/code/requests", {
    method: "POST",
    headers: {
      "x-nova-client-app-id": appId,
      ...(token === null ? {} : { authorization: "Bearer " + token }),
    },
  });
}

test("requests without a Base44 app identity continue to the Supabase auth path", () => {
  assert.deepEqual(authenticateNovaCodeServiceRequest(new Request("https://nova.example")), { attempted: false, ok: false });
});

test("service authentication fails closed when server secrets are absent", () => {
  delete process.env.NOVA_CODE_BASE44_SERVICE_TOKEN;
  delete process.env.NOVA_CODE_BASE44_TENANT_ID;
  try {
    const result = authenticateNovaCodeServiceRequest(makeRequest());
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  } finally { restore(); }
});

test("service authentication rejects an unapproved Base44 app id", () => {
  configure();
  try {
    const result = authenticateNovaCodeServiceRequest(makeRequest("another-app-id"));
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  } finally { restore(); }
});

test("service authentication rejects a missing or incorrect token", () => {
  configure();
  try {
    assert.equal(authenticateNovaCodeServiceRequest(makeRequest(NOVA_CODE_BASE44_APP_ID, null)).status, 401);
    assert.equal(authenticateNovaCodeServiceRequest(makeRequest(NOVA_CODE_BASE44_APP_ID, "wrong-token")).status, 401);
  } finally { restore(); }
});

test("service authentication binds the approved app to the server-configured tenant", () => {
  configure();
  try {
    const result = authenticateNovaCodeServiceRequest(makeRequest());
    assert.equal(result.ok, true);
    assert.deepEqual(result.identity, { kind: "service", appId: NOVA_CODE_BASE44_APP_ID, tenantId: "tenant-test-001" });
  } finally { restore(); }
});

test("service authentication refuses incomplete tenant mapping", () => {
  configure(validToken, "");
  try {
    const result = authenticateNovaCodeServiceRequest(makeRequest());
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  } finally { restore(); }
});
