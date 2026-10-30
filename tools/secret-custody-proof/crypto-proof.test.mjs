import test from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv, createDecipheriv, createHash, generateKeyPairSync,
  randomBytes, sign, verify
} from "node:crypto";

function canonicalAad(binding) {
  const fields = [
    "NOVA-CUSTODY-AAD-V1",
    binding.bindingId,
    binding.ownerId,
    binding.tenantId ?? "NO_TENANT",
    binding.connectionId,
    binding.provider,
    binding.environment,
    binding.credentialType,
    String(binding.generation)
  ];
  return Buffer.from(fields.map(value => {
    const text = String(value);
    return Buffer.byteLength(text, "utf8") + ":" + text;
  }).join("|"), "utf8");
}

function encryptAead(plaintext, dek, aad) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { nonce, ciphertext, tag: cipher.getAuthTag() };
}

function decryptAead(record, dek, aad) {
  const decipher = createDecipheriv("aes-256-gcm", dek, record.nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(record.tag);
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString("utf8");
}

function wrapDek(dek, kek) {
  return encryptAead(dek.toString("base64"), kek, Buffer.from("NOVA-DEK-WRAP-V1"));
}

function unwrapDek(wrapped, kek) {
  return Buffer.from(decryptAead(wrapped, kek, Buffer.from("NOVA-DEK-WRAP-V1")), "base64");
}

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

test("envelope encryption uses a fresh per-version DEK and authenticates immutable binding AAD", () => {
  const plaintext = "SYNTHETIC-CREDENTIAL-NOT-REAL";
  const dekV1 = randomBytes(32);
  const dekV2 = randomBytes(32);
  const kek = randomBytes(32);
  const aadV1 = canonicalAad(binding);
  const recordV1 = encryptAead(plaintext, dekV1, aadV1);
  const recordV2 = encryptAead(plaintext, dekV2, canonicalAad({ ...binding, generation: 2 }));

  assert.notDeepEqual(dekV1, dekV2);
  assert.notDeepEqual(recordV1.nonce, recordV2.nonce);
  assert.equal(decryptAead(recordV1, dekV1, aadV1), plaintext);
  assert.throws(() => decryptAead(recordV1, dekV1, canonicalAad({ ...binding, ownerId: "user-b" })));
  assert.throws(() => decryptAead(recordV1, dekV1, canonicalAad({ ...binding, connectionId: "connection-b" })));
  assert.throws(() => decryptAead(recordV1, dekV1, canonicalAad({ ...binding, provider: "other_provider" })));
  assert.throws(() => decryptAead(recordV1, dekV1, canonicalAad({ ...binding, environment: "production" })));
  assert.throws(() => decryptAead(recordV1, dekV1, canonicalAad({ ...binding, generation: 2 })));
  const tampered = { ...recordV1, ciphertext: Buffer.from(recordV1.ciphertext) };
  tampered.ciphertext[0] ^= 1;
  assert.throws(() => decryptAead(tampered, dekV1, aadV1));
});

test("wrapped DEK can be rewrapped under a new KEK without exposing plaintext credential", () => {
  const plaintext = "SYNTHETIC-CREDENTIAL-NOT-REAL";
  const dek = randomBytes(32);
  const oldKek = randomBytes(32);
  const newKek = randomBytes(32);
  const encrypted = encryptAead(plaintext, dek, canonicalAad(binding));
  const wrappedV1 = wrapDek(dek, oldKek);
  const unwrapped = unwrapDek(wrappedV1, oldKek);
  const wrappedV2 = wrapDek(unwrapped, newKek);
  const recoveredDek = unwrapDek(wrappedV2, newKek);

  assert.deepEqual(recoveredDek, dek);
  assert.equal(decryptAead(encrypted, recoveredDek, canonicalAad(binding)), plaintext);
  assert.throws(() => unwrapDek(wrappedV2, oldKek));
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
