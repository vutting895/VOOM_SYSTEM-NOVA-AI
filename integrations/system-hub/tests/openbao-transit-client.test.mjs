import test from "node:test";
import assert from "node:assert/strict";
import { createOpenBaoTransitClient } from "../openbao-transit-client.js";

const TOKEN = "synthetic-machine-token";
const CONTEXT = "staging|owner-a|connection-a|exness_mt5|demo";
const CIPHERTEXT = "vault:v1:c3ludGhldGljLWNpcGhlcnRleHQ=";

test("requires an explicitly injected private transport and scoped token", () => {
  assert.throws(() => createOpenBaoTransitClient({ token: TOKEN, keyName: "nova-staging" }), /private_transport_required/);
  assert.throws(() => createOpenBaoTransitClient({ request: async () => ({}), keyName: "nova-staging" }), /machine_token_required/);
  assert.throws(() => createOpenBaoTransitClient({ request: async () => ({}), token: TOKEN, keyName: "../root" }), /key_name_invalid/);
});

test("encrypt sends only base64 plaintext and the caller's context to the fixed Transit path", async () => {
  let seen;
  const client = createOpenBaoTransitClient({
    token: TOKEN,
    keyName: "nova-staging",
    request: async (input) => {
      seen = input;
      return { ok: true, data: { ciphertext: CIPHERTEXT } };
    }
  });
  const ciphertext = await client.encrypt("synthetic-secret", CONTEXT);
  assert.equal(ciphertext, CIPHERTEXT);
  assert.equal(seen.method, "POST");
  assert.equal(seen.path, "/v1/transit/encrypt/nova-staging");
  assert.equal(seen.headers["X-Vault-Token"], TOKEN);
  assert.equal(seen.body.plaintext, btoa("synthetic-secret"));
  assert.equal(seen.body.context, btoa(CONTEXT));
  assert.equal(JSON.stringify(seen).includes("synthetic-secret"), false);
});

test("decrypt returns bytes and binds the exact caller context", async () => {
  let seen;
  const client = createOpenBaoTransitClient({
    token: TOKEN,
    keyName: "nova-staging",
    request: async (input) => {
      seen = input;
      return { ok: true, data: { plaintext: btoa("synthetic-secret") } };
    }
  });
  const plaintext = await client.decrypt(CIPHERTEXT, CONTEXT);
  assert.equal(new TextDecoder().decode(plaintext), "synthetic-secret");
  assert.equal(seen.path, "/v1/transit/decrypt/nova-staging");
  assert.equal(seen.body.ciphertext, CIPHERTEXT);
  assert.equal(seen.body.context, btoa(CONTEXT));
});

test("invalid sizes, contexts, ciphertexts, and malformed responses fail closed", async () => {
  const client = createOpenBaoTransitClient({
    token: TOKEN,
    keyName: "nova-staging",
    maxBytes: 32,
    request: async () => ({ ok: true, data: { ciphertext: "not-ciphertext" } })
  });
  await assert.rejects(client.encrypt("x".repeat(33), CONTEXT), /size_invalid/);
  await assert.rejects(client.encrypt("secret", ""), /context_size_invalid/);
  await assert.rejects(client.decrypt("not-ciphertext", CONTEXT), /ciphertext_invalid/);
  await assert.rejects(client.encrypt("secret", CONTEXT), /invalid_response/);
});

test("transport failures are sanitized and do not expose the token or upstream error", async () => {
  const client = createOpenBaoTransitClient({
    token: TOKEN,
    keyName: "nova-staging",
    request: async () => { throw new Error("leaked upstream response " + TOKEN); }
  });
  await assert.rejects(client.encrypt("secret", CONTEXT), (error) => {
    assert.equal(error.message, "openbao_unavailable");
    assert.equal(error.message.includes(TOKEN), false);
    return true;
  });
});

test("rejects non-success transport responses without parsing or returning upstream bodies", async () => {
  const client = createOpenBaoTransitClient({
    token: TOKEN,
    keyName: "nova-staging",
    request: async () => ({ ok: false, status: 403, body: "secret upstream details" })
  });
  await assert.rejects(client.encrypt("secret", CONTEXT), /openbao_request_rejected/);
});
