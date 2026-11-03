import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchWithBearer } from "../src/lib/authenticated-fetch.js";

test("authenticated fetch fails closed when the session has no access token", async () => {
  let called = false;
  await assert.rejects(
    fetchWithBearer("https://worker.example/api/chat", async () => null, {}, async () => {
      called = true;
      return new Response("{}");
    }),
    /authentication_required/
  );
  assert.equal(called, false);
});

test("authenticated fetch attaches the current bearer token and disables redirects/cache", async () => {
  let seen;
  const response = await fetchWithBearer(
    "https://worker.example/api/chat",
    async () => "current-user-access-token",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  );
  assert.equal(response.status, 200);
  assert.equal(seen.init.headers.get("Authorization"), "Bearer current-user-access-token");
  assert.equal(seen.init.headers.get("Accept"), "application/json");
  assert.equal(seen.init.headers.get("Content-Type"), "application/json");
  assert.equal(seen.init.cache, "no-store");
  assert.equal(seen.init.redirect, "error");
  assert.equal(seen.init.body, "{}");
});

test("caller-supplied Authorization is replaced with the verified session token", async () => {
  let authorization;
  await fetchWithBearer(
    "https://worker.example/v1/connections",
    async () => "session-token",
    { headers: { Authorization: "Bearer attacker-controlled-token" } },
    async (_url, init) => {
      authorization = init.headers.get("Authorization");
      return new Response("{}", { status: 200 });
    }
  );
  assert.equal(authorization, "Bearer session-token");
});

test("the browser app uses Supabase Auth, bearer API clients, and route protection", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../src/auth/AuthProvider.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /onAuthStateChange/);
  assert.match(app, /Navigate to="\/login"/);
  assert.match(api, /Authorization/);
  assert.match(api, /voom-system-hub\.suwapat787\.workers\.dev/);
  assert.match(api, /voom-system-nova-ai\.suwapat787\.workers\.dev/);
});

test("local Express server has no hardcoded broker-connected or fake AI routes", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(server, /status:\s*['"]connected['"]/);
  assert.doesNotMatch(server, /accountConnected:\s*true/);
  assert.doesNotMatch(server, /app\.(get|post)\(['"]\/api\/(broker|chat|gen-ai)/);
});
