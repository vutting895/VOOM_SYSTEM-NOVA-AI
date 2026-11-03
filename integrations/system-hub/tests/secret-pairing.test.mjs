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
function authAndDb({ ownerId = USER_ID, row = null, onPatch = null } = {}) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      return Response.json({ id: USER_ID });
    }
    if (url.pathname === "/rest/v1/secret_pairing_sessions") {
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      if (init.method === "POST") {
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
      if (init.method === "PATCH") {
        const body = JSON.parse(init.body);
        const filters = Object.fromEntries(url.searchParams.entries());
        if (ownerId !== USER_ID || !row || filters.owner_id !== "eq." + USER_ID ||
            filters.token_hash !== "eq." + row.token_hash ||
            filters.status !== "eq." + row.status || filters.expires_at?.startsWith("gt.") !== true) {
          return Response.json([]);
        }
        const next = { ...row, ...body };
        if (onPatch) onPatch(next);
        return Response.json([next]);
      }
      if (init.method === undefined) {
        const filters = Object.fromEntries(url.searchParams.entries());
        if (!row || filters.owner_id !== "eq." + USER_ID || filters.id !== "eq." + PAIRING_ID) return Response.json([]);
        return Response.json([{
          id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at,
          created_at: row.created_at, scanned_at: row.scanned_at, approved_at: row.approved_at
        }]);
      }
    }
    throw new Error("Unexpected request " + url.pathname);
  };
}

test("pairing creation returns a one-time 256-bit token but persists only its hash", async () => {
  authAndDb();
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

test("claim and approval are owner-bound, one-time and clear the token hash", async () => {
  let row;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: USER_ID });
    if (url.pathname !== "/rest/v1/secret_pairing_sessions") throw new Error("Unexpected request");
    if (init.method === "POST") {
      const value = JSON.parse(init.body);
      row = {
        id: PAIRING_ID, owner_id: USER_ID, token_hash: value.token_hash,
        purpose: value.purpose, status: "pending", expires_at: value.expires_at,
        created_at: new Date().toISOString()
      };
      return Response.json([{ id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at, created_at: row.created_at }]);
    }
    if (init.method === "PATCH") {
      const filters = Object.fromEntries(url.searchParams.entries());
      if (!row || filters.owner_id !== "eq." + USER_ID || filters.token_hash !== "eq." + row.token_hash ||
          filters.status !== "eq." + row.status || Date.parse(row.expires_at) <= Date.now()) return Response.json([]);
      row = { ...row, ...JSON.parse(init.body) };
      return Response.json([{
        id: row.id, purpose: row.purpose, status: row.status, expires_at: row.expires_at,
        created_at: row.created_at, scanned_at: row.scanned_at, approved_at: row.approved_at
      }]);
    }
    throw new Error("Unexpected method");
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
  authAndDb();
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
