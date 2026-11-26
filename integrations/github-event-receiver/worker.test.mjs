import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import worker from "./worker.js";

const SECRET = "unit-test-only-secret-not-for-production";
const REPOSITORY = "vutting895/VOOM_SYSTEM-NOVA-AI";

function makeDb() {
  const seen = new Set();
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ sql, values });
              const id = values[0];
              if (seen.has(id)) return { meta: { changes: 0 } };
              seen.add(id);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function makeRequest(value, options = {}) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  return new Request("https://receiver.test/github", {
    method: options.method || "POST",
    headers: {
      "Content-Type": options.contentType || "application/json",
      "X-Hub-Signature-256": options.signature || "sha256=" + signature,
      "X-GitHub-Delivery": options.deliveryId || randomUUID(),
      "X-GitHub-Event": options.eventName || "push",
    },
    body: options.method === "GET" ? undefined : raw,
  });
}

function payload(repository = REPOSITORY) {
  return {
    ref: "refs/heads/main",
    after: "a".repeat(40),
    repository: { full_name: repository },
    sender: { login: "test-user" },
    commits: [{ message: "test payload must not be persisted" }],
  };
}

function env(db = makeDb()) {
  return {
    GITHUB_WEBHOOK_SECRET: SECRET,
    ALLOWED_REPOSITORIES: REPOSITORY,
    EVENT_DB: db,
  };
}

test("health endpoint reports read-only inbox mode", async () => {
  const response = await worker.fetch(new Request("https://receiver.test/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, service: "nova-github-event-receiver", mode: "read-only", writesTo: "event-inbox-only",
  });
});

test("valid signed event is stored as a sanitized envelope", async () => {
  const db = makeDb();
  const deliveryId = "12345678-1234-4234-8234-123456789abc";
  const request = makeRequest(payload(), { deliveryId });
  const response = await worker.fetch(request, env(db));
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.accepted, true);
  assert.equal(body.sideEffects, false);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /INSERT OR IGNORE/);
  assert.equal(db.calls[0].values[0], deliveryId);
  assert.equal(db.calls[0].values.includes(JSON.stringify(payload())), false);
  assert.equal(db.calls[0].values.includes("test payload must not be persisted"), false);
});

test("duplicate delivery ID is idempotent", async () => {
  const db = makeDb();
  const deliveryId = "12345678-1234-4234-8234-123456789abc";
  const first = await worker.fetch(makeRequest(payload(), { deliveryId }), env(db));
  const second = await worker.fetch(makeRequest(payload(), { deliveryId }), env(db));
  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true);
  assert.equal(db.calls.length, 2);
});

test("invalid signature is rejected before persistence", async () => {
  const db = makeDb();
  const response = await worker.fetch(makeRequest(payload(), { signature: "sha256=" + "0".repeat(64) }), env(db));
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
});

test("repository outside allowlist is rejected", async () => {
  const db = makeDb();
  const response = await worker.fetch(makeRequest(payload("someone/other-repo")), env(db));
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test("unsupported event is rejected", async () => {
  const db = makeDb();
  const response = await worker.fetch(makeRequest(payload(), { eventName: "deployment" }), env(db));
  assert.equal(response.status, 400);
  assert.equal(db.calls.length, 0);
});

test("missing runtime configuration fails closed", async () => {
  const response = await worker.fetch(makeRequest(payload()), {});
  assert.equal(response.status, 503);
});

test("wrong content type is rejected", async () => {
  const db = makeDb();
  const response = await worker.fetch(makeRequest(payload(), { contentType: "text/plain" }), env(db));
  assert.equal(response.status, 415);
  assert.equal(db.calls.length, 0);
});

test("wrong method and unknown path are rejected", async () => {
  const method = await worker.fetch(new Request("https://receiver.test/github", { method: "GET" }), env());
  const path = await worker.fetch(new Request("https://receiver.test/unknown"), env());
  assert.equal(method.status, 405);
  assert.equal(path.status, 404);
});
