import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const encoder = new TextEncoder();

const keyBytes = encoder.encode("LOCAL-ONLY-HMAC-KEY-32-BYTE-0123");
const canonicalMessage = [
  "NOVA-VAULT-ASSERTION-V1",
  "voom-system-hub",
  "nova-vault-access",
  "local-proof-v1",
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000101",
  "proof_provider",
  "demo",
  "account_read",
  "1",
  "00000000-0000-4000-8000-000000000901",
  "00000000-0000-4000-8000-000000000a01",
  "1761800000",
  "1761800060",
].join("\n");

const expectedHex = "d43bad3836bb5b8e0e4e6b17ca558d1ce639e1d2cb22561ed11a45618c53d696";

test("Worker-compatible Web Crypto HMAC-SHA-256 matches the canonical known-answer vector", async () => {
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

test("canonical message uses the exact newline field order with no trailing newline", () => {
  assert.equal(canonicalMessage.split("\n").length, 15);
  assert.equal(canonicalMessage.endsWith("\n"), false);
  assert.equal(encoder.encode(canonicalMessage).byteLength, 314);
});
