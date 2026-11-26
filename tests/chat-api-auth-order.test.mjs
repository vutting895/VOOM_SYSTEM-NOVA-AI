import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(
  new URL("../integrations/system-hub/worker.js", import.meta.url),
  "utf8",
);
const fetchHandler = workerSource.slice(workerSource.lastIndexOf("async fetch("));

test("System Hub authenticates before connection operations", () => {
  const authIndex = fetchHandler.indexOf("const auth = await authenticate(request, env);");
  const createIndex = fetchHandler.indexOf("return createConnection(request, env, auth, origin);");
  const queryIndex = fetchHandler.indexOf("queryOwnConnections(env, auth)");
  assert.notEqual(authIndex, -1, "protected route must authenticate");
  assert.notEqual(createIndex, -1, "connection creation must exist behind auth");
  assert.ok(authIndex < createIndex, "authentication must precede connection creation");
  assert.ok(authIndex < queryIndex, "authentication must precede tenant-scoped reads");
});

test("unauthenticated requests return before connection reads or writes", () => {
  const authIndex = fetchHandler.indexOf("const auth = await authenticate(request, env);");
  const failureIndex = fetchHandler.indexOf("if (!auth.ok)", authIndex);
  const createIndex = fetchHandler.indexOf("return createConnection(request, env, auth, origin);", authIndex);
  assert.ok(failureIndex > authIndex, "auth result must be checked");
  assert.ok(failureIndex < createIndex, "auth failure must return before writes");
  assert.match(fetchHandler.slice(failureIndex, createIndex), /auth\.status/);
});
