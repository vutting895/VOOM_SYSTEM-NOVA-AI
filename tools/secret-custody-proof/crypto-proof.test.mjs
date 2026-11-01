import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify, webcrypto } from "node:crypto";
import { canonicalAad, canonicalWrapAad, createEnvelopeCrypto } from "./envelope-crypto.mjs";

const binding = Object.freeze({
  bindingId: "binding-a",
  ownerId: "user-a",
  tenantId: null,
  connectionId: "connection-a",
  provider: "exness_mt5",
  environment: "demo",
  credentialType: "api_key",
  generation: 1
});
const cryptoImpl = webcrypto;

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function createSyntheticKeyProvider() {
  const keys = new Map([
    ["kek-v1", cryptoImpl.getRandomValues(new Uint8Array(32))],
    ["kek-v2", cryptoImpl.getRandomValues(new Uint8Array(32))]
  ]);

  async function wrap(plaintextKey, version, context) {
    const keyBytes = keys.get(version);
    if (!keyBytes) throw new Error("UNKNOWN_SYNTHETIC_KEK");
    const key = await cryptoImpl.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const nonce = cryptoImpl.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await cryptoImpl.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: canonicalWrapAad(context), tagLength: 128 },
      key,
      plaintextKey
    ));
    return concat(nonce, sealed);
  }

  async function unwrap(wrappedKey, version, context) {
    const keyBytes = keys.get(version);
    if (!keyBytes) throw new Error("UNKNOWN_SYNTHETIC_KEK");
    if (!(wrappedKey instanceof Uint8Array) || wrappedKey.length < 28) throw new Error("INVALID_WRAPPED_DEK");
    const key = await cryptoImpl.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    return new Uint8Array(await cryptoImpl.subtle.decrypt(
      { name: "AES-GCM", iv: wrappedKey.slice(0, 12), additionalData: canonicalWrapAad(context), tagLength: 128 },
      key,
      wrappedKey.slice(12)
    ));
  }

  return {
    keys,
    async generateDataKey({ binding: context }) {
      const plaintextKey = cryptoImpl.getRandomValues(new Uint8Array(32));
      return { plaintextKey, wrappedKey: await wrap(plaintextKey, "kek-v1", context), keyVersion: "kek-v1" };
    },
    unwrapDataKey({ wrappedKey, keyVersion, binding: context }) {
      return unwrap(wrappedKey, keyVersion, context);
    },
    async rewrapDataKey({ wrappedKey, sourceKeyVersion, targetKeyVersion, binding: context }) {
      const dek = await unwrap(wrappedKey, sourceKeyVersion, context);
      try {
        return { wrappedKey: await wrap(dek, targetKeyVersion, context), keyVersion: targetKeyVersion };
      } finally {
        dek.fill(0);
      }
    }
  };
}

test("envelope crypto uses a fresh DEK and binds AES-GCM ciphertext to immutable owner/connection/provider context", async () => {
  const keyProvider = createSyntheticKeyProvider();
  const envelope = createEnvelopeCrypto({ keyProvider, cryptoImpl });
  const plaintext = "SYNTHETIC-CREDENTIAL-NOT-REAL";
  const record = await envelope.encrypt(plaintext, binding);

  assert.equal(record.algorithm, "AES-256-GCM");
  assert.equal(new TextDecoder().decode(await envelope.decrypt(record, binding)), plaintext);
  for (const changed of [
    { ...binding, ownerId: "user-b" },
    { ...binding, connectionId: "connection-b" },
    { ...binding, provider: "other_provider" },
    { ...binding, environment: "production" },
    { ...binding, generation: 2 }
  ]) {
    await assert.rejects(envelope.decrypt(record, changed));
  }
  const tampered = { ...record, ciphertext: new Uint8Array(record.ciphertext) };
  tampered.ciphertext[0] ^= 1;
  await assert.rejects(envelope.decrypt(tampered, binding));
});

test("DEK rewrap changes only wrapped key metadata and preserves ciphertext under the new KEK version", async () => {
  const keyProvider = createSyntheticKeyProvider();
  const envelope = createEnvelopeCrypto({ keyProvider, cryptoImpl });
  const plaintext = "SYNTHETIC-CREDENTIAL-NOT-REAL";
  const record = await envelope.encrypt(plaintext, binding);
  const rewrapped = await envelope.rewrap(record, binding, "kek-v2");

  assert.equal(rewrapped.keyVersion, "kek-v2");
  assert.deepEqual(rewrapped.nonce, record.nonce);
  assert.deepEqual(rewrapped.ciphertext, record.ciphertext);
  assert.deepEqual(rewrapped.tag, record.tag);
  assert.notDeepEqual(rewrapped.wrappedDek, record.wrappedDek);
  assert.equal(new TextDecoder().decode(await envelope.decrypt(rewrapped, binding)), plaintext);
  await assert.rejects(keyProvider.unwrapDataKey({
    wrappedKey: rewrapped.wrappedDek, keyVersion: "kek-v1", binding
  }));
});

test("plaintext DEK buffers are zeroed after encrypt and decrypt operations", async () => {
  const keyProvider = createSyntheticKeyProvider();
  let generated;
  let unwrapped;
  const provider = {
    ...keyProvider,
    async generateDataKey(input) {
      const material = await keyProvider.generateDataKey(input);
      generated = material.plaintextKey;
      return material;
    },
    async unwrapDataKey(input) {
      unwrapped = await keyProvider.unwrapDataKey(input);
      return unwrapped;
    }
  };
  const envelope = createEnvelopeCrypto({ keyProvider: provider, cryptoImpl });
  const record = await envelope.encrypt("SYNTHETIC-CREDENTIAL-NOT-REAL", binding);
  assert.equal(generated.every(value => value === 0), true);
  await envelope.decrypt(record, binding);
  assert.equal(unwrapped.every(value => value === 0), true);
});

test("asymmetric issuer signature is verifiable with public key only and binds request context", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const claims = {
    issuer: "nova-custody-issuer",
    audience: "nova-secret-custody",
    subject: "user-a",
    connectionId: "connection-a",
    capability: "account.summary.read",
    operationId: "operation-a",
    requestDigest: createHash("sha256").update("canonical-nonsecret-request").digest("hex"),
    issuedAt: 1793390000,
    expiresAt: 1793390060,
    tokenId: "nonce-a"
  };
  const message = Buffer.from(JSON.stringify(claims), "utf8");
  const signature = sign(null, message, privateKey);
  assert.equal(verify(null, message, publicKey, signature), true);
  const tampered = Buffer.from(JSON.stringify({ ...claims, subject: "user-b" }), "utf8");
  assert.equal(verify(null, tampered, publicKey, signature), false);
  const publicJwk = publicKey.export({ format: "jwk" });
  assert.equal(publicJwk.d, undefined);
  assert.equal(publicJwk.x !== undefined, true);
  assert.equal(privateKey.type, "private");
});
