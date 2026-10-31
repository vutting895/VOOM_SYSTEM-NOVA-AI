import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createExnessReadOnlyClient,
  importExnessEd25519PrivateKey,
  signedExnessGetHeaders,
  validateAccountId,
  normalizeExnessBaseUrl
} from "../exness-api.js";

const PRIVATE_KEY = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const API_KEY = "exnsk-synthetic-example";
const TIMESTAMP = 1773656070123;

function hexBytes(value) {
  return Uint8Array.from(value.match(/../g), (part) => Number.parseInt(part, 16));
}
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

test("Exness signed GET headers use the documented Ed25519 payload and signature", async () => {
  const privateKey = await importExnessEd25519PrivateKey(PRIVATE_KEY, webcrypto);
  const headers = await signedExnessGetHeaders({
    apiKey: API_KEY,
    privateKey,
    pathWithQuery: "/v1/trading/access-point?account_id=123456",
    timestamp: TIMESTAMP,
    cryptoProvider: webcrypto
  });
  const payloadBytes = decodeBase64Url(headers["EXN-DATA"]);
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  assert.deepEqual(payload, {
    api_key: API_KEY,
    idempotency_key: "",
    timestamp: TIMESTAMP,
    sign_version: 1,
    method: "GET",
    path: "/v1/trading/access-point?account_id=123456",
    body_hash: "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"
  });
  assert.equal(headers["EXN-IDEMPOTENCY-KEY"], "");
  assert.equal(headers["EXN-SIGN-VERSION"], "1");
  assert.equal(headers["EXN-TIMESTAMP"], String(TIMESTAMP));

  const publicKey = await webcrypto.subtle.importKey(
    "raw", hexBytes(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]
  );
  const verified = await webcrypto.subtle.verify(
    "Ed25519", publicKey, decodeBase64Url(headers["EXN-SIGN"]), payloadBytes
  );
  assert.equal(verified, true);
});

test("Exness client discovers the account access point and reads only that account", async () => {
  const privateKey = await importExnessEd25519PrivateKey(PRIVATE_KEY, webcrypto);
  const requests = [];
  const client = createExnessReadOnlyClient({
    apiKey: API_KEY,
    privateKey,
    gatewayUrl: "https://api.exness.com",
    now: () => TIMESTAMP,
    cryptoProvider: webcrypto,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      if (url.pathname === "/v1/trading/access-point") {
        assert.equal(url.search, "?account_id=123456");
        return Response.json({
          account_id: 123456,
          access_point: "https://ap-4decef67.exness.com"
        });
      }
      if (url.pathname === "/v1/configuration/accounts/123456/account") {
        return Response.json({
          account_id: 123456,
          currency: "USD",
          leverage: "1:2000"
        });
      }
      throw new Error("Unexpected URL");
    }
  });

  const accessPoint = await client.resolveAccessPoint("123456");
  assert.equal(accessPoint, "https://ap-4decef67.exness.com");
  const account = await client.readAccount("123456");
  assert.equal(account.account_id, 123456);
  assert.equal(account.currency, "USD");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.origin, "https://api.exness.com");
  assert.equal(requests[1].url.origin, accessPoint);
  assert.equal(requests[0].init.headers["EXN-IDEMPOTENCY-KEY"], "");
  assert.deepEqual(client.capabilities, {
    accountRead: true,
    marketDataRead: false,
    orderSubmission: false,
    tradeMutation: false,
    withdrawal: false,
    transfer: false,
    liveTradingEnabled: false
  });
});

test("account read is blocked until host discovery succeeds for the same account", async () => {
  const privateKey = await importExnessEd25519PrivateKey(PRIVATE_KEY, webcrypto);
  const client = createExnessReadOnlyClient({
    apiKey: API_KEY,
    privateKey,
    gatewayUrl: "https://api.exness.com",
    cryptoProvider: webcrypto,
    fetchImpl: async () => Response.json({ account_id: 123456, access_point: "https://ap-4decef67.exness.com" })
  });
  await assert.rejects(() => client.readAccount("123456"), /exness_access_point_not_resolved/);
  await client.resolveAccessPoint("123456");
  await assert.rejects(() => client.readAccount("654321"), /exness_access_point_not_resolved/);
});

test("untrusted host and invalid account identifiers are rejected", async () => {
  assert.throws(() => normalizeExnessBaseUrl("https://attacker.example"), /invalid_exness_host/);
  assert.throws(() => normalizeExnessBaseUrl("http://api.exness.com"), /invalid_exness_host/);
  assert.throws(() => normalizeExnessBaseUrl("https://user:pass@api.exness.com"), /invalid_exness_host/);
  assert.throws(() => validateAccountId("0"), /invalid_exness_account_id/);
  assert.throws(() => validateAccountId("123abc"), /invalid_exness_account_id/);
  assert.throws(() => validateAccountId("18446744073709551616"), /invalid_exness_account_id/);
});

test("account identity mismatch and non-JSON upstream response fail closed", async () => {
  const privateKey = await importExnessEd25519PrivateKey(PRIVATE_KEY, webcrypto);
  const client = createExnessReadOnlyClient({
    apiKey: API_KEY,
    privateKey,
    gatewayUrl: "https://api.exness.com",
    cryptoProvider: webcrypto,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/trading/access-point") {
        return Response.json({ account_id: 123456, access_point: "https://ap-4decef67.exness.com" });
      }
      return Response.json({ account_id: 999999, currency: "USD" });
    }
  });
  await client.resolveAccessPoint("123456");
  await assert.rejects(() => client.readAccount("123456"), /exness_account_identity_mismatch/);
});
