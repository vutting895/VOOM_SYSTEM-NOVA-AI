import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const TOKEN = "synthetic-user-token";
const USER_ID = "user-a";
const PAIRING_ID = "00000000-0000-4000-8000-000000000000";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  ALLOWED_ORIGINS: "https://voomsystem.netlify.app"
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function req(path, options = {}) {
  return new Request("https://hub.test" + path, options);
}
function mockCreate() {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      return Response.json({ id: USER_ID });
    }
    if (url.pathname === "/rest/v1/secret_pairing_sessions" && init.method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.owner_id, USER_ID);
      assert.equal(body.status, "pending");
      assert.match(body.token_hash, /^[a-f0-9]{64}$/);
      assert.equal(body.expires_at !== undefined, true);
      assert.equal(body.purpose, "provider_connection");
      return Response.json([{
        id: PAIRING_ID, purpose: body.purpose, status: "pending",
        expires_at: body.expires_at, created_at: new Date().toISOString()
      }], { status: 201 });
    }
    throw new Error("Unexpected request " + url.pathname);
  };
}

test("pairing creation returns a one-time 256-bit token but persists only its hash", async () => {
  mockCreate();
  const response = await worker.fetch(req("/v1/secrets/pairings", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: "{}"
  }), env);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.match(body.pairingToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(body.pairingUrl, /#pair=/);
  assert.equal(body.credentialIntakeEnabled, false);
  assert.equal(body.secretStorageEnabled, false);
  assert.equal(body.ordersEnabled, false);
});

test("claim and approval use owner-checked atomic RPCs and reject replay", async () => {
  let row;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: USER_ID });
    if (url.pathname === "/rest/v1/secret_pairing_sessions" && init.method === "POST") {
      const value = JSON.parse(init.body);
      row = {
        id: PAIRING_ID, owner_id: USER_ID, token_hash: value.token_hash,
        purpose: value.purpose, status: "pending", expires_at: value.expires_at,
        created_at: new Date().toISOString()
      };
      return Response.json([{ id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at, created_at: row.created_at }]);
    }
    if (url.pathname === "/rest/v1/rpc/nova_claim_secret_pairing") {
      const value = JSON.parse(init.body);
      if (!row || row.owner_id !== USER_ID || row.token_hash !== value.p_token_hash ||
          row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) return Response.json([]);
      row = { ...row, status: "scanned", scanned_at: new Date().toISOString() };
      return Response.json([{
        id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at,
        created_at: row.created_at, scanned_at: row.scanned_at, approved_at: null
      }]);
    }
    if (url.pathname === "/rest/v1/rpc/nova_approve_secret_pairing") {
      const value = JSON.parse(init.body);
      if (!row || row.owner_id !== USER_ID || row.id !== value.p_pairing_id ||
          row.token_hash !== value.p_token_hash || row.status !== "scanned" ||
          Date.parse(row.expires_at) <= Date.now()) return Response.json([]);
      row = { ...row, status: "approved", approved_at: new Date().toISOString(), token_hash: null };
      return Response.json([{
        id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at,
        created_at: row.created_at, scanned_at: row.scanned_at, approved_at: row.approved_at
      }]);
    }
    throw new Error("Unexpected request " + url.pathname);
  };
  const created = await worker.fetch(req("/v1/secrets/pairings", {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: "{}"
  }), env);
  const createdBody = await created.json();
  const claim = await worker.fetch(req("/v1/secrets/pairings/claim", {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ token: createdBody.pairingToken })
  }), env);
  assert.equal(claim.status, 200);
  assert.equal((await claim.json()).pairing.status, "scanned");

  const approve = await worker.fetch(req("/v1/secrets/pairings/" + PAIRING_ID, {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ token: createdBody.pairingToken })
  }), env);
  const approved = await approve.json();
  assert.equal(approve.status, 200);
  assert.equal(approved.approved, true);
  assert.equal(approved.credentialIntakeEnabled, false);
  assert.equal(row.token_hash, null);

  const replay = await worker.fetch(req("/v1/secrets/pairings/" + PAIRING_ID, {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ token: createdBody.pairingToken })
  }), env);
  assert.equal(replay.status, 409);
});

test("pairing routes require a valid Supabase session", async () => {
  const response = await worker.fetch(req("/v1/secrets/pairings", { method: "POST" }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("malformed token and unsupported methods fail closed", async () => {
  mockCreate();
  const bad = await worker.fetch(req("/v1/secrets/pairings/claim", {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "not-a-token" })
  }), env);
  assert.equal(bad.status, 400);
  const method = await worker.fetch(req("/v1/secrets/pairings/" + PAIRING_ID, {
    method: "DELETE", headers: { Authorization: "Bearer " + TOKEN }
  }), env);
  assert.equal(method.status, 405);
});

test("a foreign authenticated owner cannot claim another owner's token", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-b" });
    if (url.pathname === "/rest/v1/rpc/nova_claim_secret_pairing") return Response.json([]);
    throw new Error("Unexpected request " + url.pathname);
  };
  const response = await worker.fetch(req("/v1/secrets/pairings/claim", {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "A".repeat(43) })
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "pairing_invalid_expired_used_or_not_owned");
});
