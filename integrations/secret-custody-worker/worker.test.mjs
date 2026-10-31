import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const encoder = new TextEncoder();
const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const keyB64 = btoa(String.fromCharCode(...keyBytes));
const testToken = "local-synthetic-test-token-not-for-deployment";

function database() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      assert.match(sql, /^INSERT INTO synthetic_credentials/);
      return {
        bind(...values) {
          return {
            async run() {
              rows.push({
                id: values[0], fixture_id: values[1], algorithm: values[2],
                nonce: values[3], ciphertext: values[4], wrapped_dek: values[5],
                wrap_nonce: values[6], key_version: values[7], created_at: values[8]
              });
              return { success: true };
            }
          };
        }
      };
    }
  };
}

function env(overrides = {}) {
  return {
    CUSTODY_MODE: "synthetic",
    ALLOW_SYNTHETIC_TEST_ROUTES: "true",
    SYNTHETIC_TEST_TOKEN: testToken,
    CUSTODY_KEK_B64: keyB64,
    CUSTODY_DB: database(),
    ...overrides
  };
}

function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-nova-synthetic-test-token"] = token;
  return new Request("https://custody.invalid" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function jsonResponse(response) {
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, private");
  assert.equal(response.headers.get("pragma"), "no-cache");
  return response.json();
}

function fromB64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

test("health reports disabled customer intake and provider operations", async () => {
  const response = await worker.fetch(request("/health"), env());
  assert.equal(response.status, 200);
  assert.deepEqual(await jsonResponse(response), {
    service: "nova-secret-custody",
    mode: "disabled",
    customer_credential_intake: false,
    provider_operations: false
  });
});

test("customer-facing custody routes fail closed", async () => {
  const response = await worker.fetch(request("/v1/credential-bindings", { method: "POST" }), env());
  assert.equal(response.status, 503);
  assert.deepEqual(await jsonResponse(response), { error: "CUSTOMER_CUSTODY_DISABLED" });
});

test("synthetic seed route is not exposed unless both synthetic gates are enabled", async () => {
  const e = env({ CUSTODY_MODE: "production" });
  const response = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: testToken
  }), e);
  assert.equal(response.status, 404);
  assert.equal(e.CUSTODY_DB.rows.length, 0);
});

test("synthetic seed requires the dedicated test token and a fixed fixture ID", async () => {
  const e = env();
  const denied = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: "wrong-token"
  }), e);
  assert.equal(denied.status, 404);
  const invalid = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001", credential: "real-secret" }, token: testToken
  }), e);
  assert.equal(invalid.status, 400);
  assert.equal(e.CUSTODY_DB.rows.length, 0);
});

test("synthetic seed encrypts a fixed fixture and persists no plaintext credential", async () => {
  const e = env();
  const response = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: testToken
  }), e);
  assert.equal(response.status, 201);
  const result = await jsonResponse(response);
  assert.equal(result.state, "SYNTHETIC_ENCRYPTED");
  assert.equal(result.key_version, "synthetic-kek-v1");
  assert.equal(e.CUSTODY_DB.rows.length, 1);

  const row = e.CUSTODY_DB.rows[0];
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes("SYNTHETIC_USER_001"), false);
  assert.equal(serialized.includes("SYNTHETIC_TOKEN_001"), false);
  assert.equal(row.algorithm, "A256GCM");

  const kek = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const wrappedDek = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromB64(row.wrap_nonce),
    additionalData: encoder.encode(JSON.stringify(["nova-custody-wrap-v1", row.id, row.key_version])),
    tagLength: 128
  }, kek, fromB64(row.wrapped_dek));
  const dek = await crypto.subtle.importKey("raw", wrappedDek, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromB64(row.nonce),
    additionalData: encoder.encode(JSON.stringify([
      "nova-custody-synthetic-v1", row.id, "synthetic-fixture", "test", 1
    ])),
    tagLength: 128
  }, dek, fromB64(row.ciphertext));
  const fixture = JSON.parse(new TextDecoder().decode(plaintext));
  assert.equal(fixture.username, "SYNTHETIC_USER_001");
  assert.equal(fixture.apiToken, "SYNTHETIC_TOKEN_001_NOT_A_REAL_SECRET");
});

test("missing database or invalid key fails closed without a plaintext fallback", async () => {
  const noDb = env({ CUSTODY_DB: undefined });
  const first = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: testToken
  }), noDb);
  assert.equal(first.status, 503);

  const badKey = env({ CUSTODY_KEK_B64: btoa("too-short") });
  const second = await worker.fetch(request("/_test/synthetic/seed", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: testToken
  }), badKey);
  assert.equal(second.status, 503);
  assert.equal(badKey.CUSTODY_DB.rows.length, 0);
});

test("synthetic route rejects query strings and oversized bodies", async () => {
  const e = env();
  const query = await worker.fetch(request("/_test/synthetic/seed?debug=1", {
    method: "POST", body: { fixture_id: "fixture-001" }, token: testToken
  }), e);
  assert.equal(query.status, 503);
  const large = new Request("https://custody.invalid/_test/synthetic/seed", {
    method: "POST",
    headers: { "x-nova-synthetic-test-token": testToken, "content-type": "application/json" },
    body: JSON.stringify({ fixture_id: "fixture-001", padding: "x".repeat(400) })
  });
  const tooLarge = await worker.fetch(large, e);
  assert.equal(tooLarge.status, 413);

  let cancelled = false;
  const chunked = new Request("https://custody.invalid/_test/synthetic/seed", {
    method: "POST",
    headers: { "x-nova-synthetic-test-token": testToken, "content-type": "application/json" },
    body: new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      }
    }),
    duplex: "half"
  });
  const chunkedTooLarge = await worker.fetch(chunked, e);
  assert.equal(chunkedTooLarge.status, 413);
  assert.equal(cancelled, true);
  assert.equal(e.CUSTODY_DB.rows.length, 0);
});
