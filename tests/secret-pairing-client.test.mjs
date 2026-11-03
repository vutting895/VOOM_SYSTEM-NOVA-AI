import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPairingToken,
  requestPairingApi,
  resolveSystemHubOrigin,
} from "../src/lib/pairing-utils.mjs";

const TOKEN = "A".repeat(43);

test("extracts one valid pairing token from a URL fragment", () => {
  assert.equal(extractPairingToken("#pair=" + TOKEN), TOKEN);
  assert.equal(extractPairingToken("pair=" + TOKEN), TOKEN);
  assert.equal(extractPairingToken("#pair=bad"), null);
  assert.equal(extractPairingToken("#pair=" + TOKEN + "&pair=" + TOKEN), null);
  assert.equal(extractPairingToken("#access_token=not-a-pairing-token"), null);
});

test("accepts only trusted HTTPS System Hub origins or localhost development", () => {
  assert.equal(resolveSystemHubOrigin("https://nova.example.workers.dev"), "https://nova.example.workers.dev");
  assert.equal(resolveSystemHubOrigin("http://localhost:8787"), "http://localhost:8787");
  assert.equal(resolveSystemHubOrigin("https://evil.example.com"), "");
  assert.equal(resolveSystemHubOrigin("https://user:pass@nova.example.workers.dev"), "");
  assert.equal(resolveSystemHubOrigin("https://nova.example.workers.dev/path"), "");
});

test("sends owner session only to the fixed pairing API with no-store and no redirects", async () => {
  let captured;
  const result = await requestPairingApi({
    origin: "https://nova.example.workers.dev",
    accessToken: "test-session-token",
    path: "/v1/secrets/pairings",
    method: "POST",
    body: {},
    fetchImpl: async (url, init) => {
      captured = { url: String(url), init };
      return Response.json({ pairing: { pairingId: "10000000-0000-4000-8000-000000000001" } });
    },
  });
  assert.equal(result.pairing.pairingId, "10000000-0000-4000-8000-000000000001");
  assert.equal(captured.url, "https://nova.example.workers.dev/v1/secrets/pairings");
  assert.equal(captured.init.headers.Authorization, "Bearer test-session-token");
  assert.equal(captured.init.cache, "no-store");
  assert.equal(captured.init.credentials, "omit");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.init.referrerPolicy, "no-referrer");
});

test("rejects arbitrary API paths and refuses calls without a bearer session", async () => {
  await assert.rejects(
    requestPairingApi({ origin: "https://nova.example.workers.dev", accessToken: "session", path: "/v1/connections" }),
    /pairing_endpoint_not_allowed/,
  );
  await assert.rejects(
    requestPairingApi({ origin: "https://nova.example.workers.dev", accessToken: "", path: "/v1/secrets/pairings" }),
    /authentication_required/,
  );
});
