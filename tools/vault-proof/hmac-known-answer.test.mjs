import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const encoder = new TextEncoder();
const keyBytes = Buffer.from("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", "base64");

const canonicalMessage = [
  "NOVA-VAULT-ASSERTION-V1",
  "voom-system-hub",
  "nova-vault-access",
  "proof-hmac-v1",
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000101",
  "proof_provider",
  "demo",
  "secret.use.readonly",
  "1",
  "00000000-0000-4000-8000-000000000901",
  "00000000-0000-4000-8000-000000000a01",
  "1761800000",
  "1761800060",
].join("\n");

const expectedHex = "ecfd257bb3dfff3d0fa34e8d1d01506b2e063a2dbeb4284c3737bb283602a001";

test("Worker-compatible Web Crypto HMAC-SHA-256 matches the Vault canonical assertion vector", async () => {
  assert.equal(keyBytes.byteLength, 32);
  const key = await webcrypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalMessage)
  );
  assert.equal(Buffer.from(signature).toString("hex"), expectedHex);
  assert.equal(signature.byteLength, 32);
});

test("Worker canonical assertion vector has exactly 15 ordered fields and no trailing newline", () => {
  assert.equal(canonicalMessage.split("\n").length, 15);
  assert.equal(canonicalMessage.endsWith("\n"), false);
  assert.equal(encoder.encode(canonicalMessage).byteLength, 320);
});
