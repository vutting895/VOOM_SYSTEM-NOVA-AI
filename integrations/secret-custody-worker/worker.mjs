const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY_VERSION = "synthetic-kek-v1";
const FIXTURES = Object.freeze({
  "fixture-001": Object.freeze({
    username: "SYNTHETIC_USER_001",
    apiToken: "SYNTHETIC_TOKEN_001_NOT_A_REAL_SECRET",
    provider: "synthetic-fixture",
    environment: "test"
  })
});
const COMMON_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: COMMON_HEADERS });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("INVALID_KEY");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function equalConstantTime(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

async function importAesKey(raw, usages) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

async function encryptBytes(key, plaintext, aad) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
    key,
    plaintext
  );
  return { nonce, ciphertext: new Uint8Array(ciphertext) };
}

async function encryptFixture(fixture, env, id) {
  const kekRaw = base64ToBytes(env.CUSTODY_KEK_B64);
  if (kekRaw.byteLength !== 32) throw new Error("INVALID_KEY");
  const kek = await importAesKey(kekRaw, ["encrypt"]);
  const dekRaw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await importAesKey(dekRaw, ["encrypt"]);
  const credentialAad = encoder.encode(JSON.stringify([
    "nova-custody-synthetic-v1", id, fixture.provider, fixture.environment, 1
  ]));
  const wrappedAad = encoder.encode(JSON.stringify(["nova-custody-wrap-v1", id, KEY_VERSION]));
  const [encrypted, wrapped] = await Promise.all([
    encryptBytes(dek, encoder.encode(JSON.stringify(fixture)), credentialAad),
    encryptBytes(kek, dekRaw, wrappedAad)
  ]);
  dekRaw.fill(0);
  return {
    nonce: bytesToBase64(encrypted.nonce),
    ciphertext: bytesToBase64(encrypted.ciphertext),
    wrappedDek: bytesToBase64(wrapped.ciphertext),
    wrapNonce: bytesToBase64(wrapped.nonce),
    keyVersion: KEY_VERSION
  };
}

async function seedSyntheticFixture(request, env) {
  if (env.CUSTODY_MODE !== "synthetic" || env.ALLOW_SYNTHETIC_TEST_ROUTES !== "true") {
    return json(404, { error: "NOT_FOUND" });
  }
  if (!equalConstantTime(request.headers.get("x-nova-synthetic-test-token"), env.SYNTHETIC_TEST_TOKEN)) {
    return json(404, { error: "NOT_FOUND" });
  }
  if (request.method !== "POST" || new URL(request.url).search || !env.CUSTODY_DB ||
      !env.CUSTODY_KEK_B64 || !env.SYNTHETIC_TEST_TOKEN) {
    return json(503, { error: "SYNTHETIC_RUNTIME_UNAVAILABLE" });
  }
  const length = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(length) || length > 256) return json(413, { error: "REQUEST_TOO_LARGE" });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 256) return json(413, { error: "REQUEST_TOO_LARGE" });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "INVALID_REQUEST" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || body.fixture_id !== "fixture-001") {
    return json(400, { error: "UNKNOWN_SYNTHETIC_FIXTURE" });
  }

  const id = crypto.randomUUID();
  try {
    const encrypted = await encryptFixture(FIXTURES[body.fixture_id], env, id);
    await env.CUSTODY_DB.prepare(
      "INSERT INTO synthetic_credentials (id, fixture_id, algorithm, nonce, ciphertext, wrapped_dek, wrap_nonce, key_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id, body.fixture_id, "A256GCM", encrypted.nonce, encrypted.ciphertext,
      encrypted.wrappedDek, encrypted.wrapNonce, encrypted.keyVersion, new Date().toISOString()
    ).run();
    return json(201, { id, state: "SYNTHETIC_ENCRYPTED", key_version: encrypted.keyVersion });
  } catch {
    return json(503, { error: "SYNTHETIC_CUSTODY_UNAVAILABLE" });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        service: "nova-secret-custody",
        mode: "disabled",
        customer_credential_intake: false,
        provider_operations: false
      });
    }
    if (url.pathname === "/_test/synthetic/seed") {
      return seedSyntheticFixture(request, env);
    }
    if (url.pathname.startsWith("/v1/")) {
      return json(503, { error: "CUSTOMER_CUSTODY_DISABLED" });
    }
    return json(404, { error: "NOT_FOUND" });
  }
};
