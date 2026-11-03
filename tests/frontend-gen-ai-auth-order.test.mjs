import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(
  new URL("../integrations/nova-ai-worker/worker.js", import.meta.url),
  "utf8",
);
const fetchHandlerStart = workerSource.indexOf("async fetch(request, env) {");
assert.notEqual(fetchHandlerStart, -1, "NOVA AI Worker fetch handler must exist");
const fetchHandler = workerSource.slice(fetchHandlerStart);

test("NOVA AI Worker authenticates before reading or parsing request JSON", () => {
  const authIndex = fetchHandler.indexOf("const auth = await authenticateRequest(request, env);");
  const bodyReadIndex = fetchHandler.indexOf("raw = await request.text();");
  const parseIndex = fetchHandler.indexOf("body = JSON.parse(raw);");
  const inputValidationIndex = fetchHandler.indexOf("validateInput(body)");

  assert.notEqual(authIndex, -1, "Worker route must authenticate");
  assert.notEqual(bodyReadIndex, -1, "Worker route must read the body after authentication");
  assert.notEqual(parseIndex, -1, "Worker route must parse JSON after authentication");
  assert.notEqual(inputValidationIndex, -1, "Worker route must validate input after authentication");
  assert.ok(authIndex < bodyReadIndex, "authentication must precede body reads");
  assert.ok(bodyReadIndex < parseIndex, "body reads must precede JSON parsing");
  assert.ok(authIndex < inputValidationIndex, "authentication must precede input validation");
});

test("NOVA AI Worker returns no-store authentication failures before payload parsing", () => {
  const authIndex = fetchHandler.indexOf("const auth = await authenticateRequest(request, env);");
  const failureIndex = fetchHandler.indexOf("if (!auth.ok) return fail(auth.error, auth.status, origin);", authIndex);
  const parseIndex = fetchHandler.indexOf("body = JSON.parse(raw);");
  const baseHeaders = workerSource.match(/const BASE_HEADERS = \{([\s\S]*?)\};/);

  assert.ok(baseHeaders, "Worker response headers must be declared");
  assert.match(baseHeaders[1], /["']Cache-Control["']\s*:\s*["']no-store["']/);
  assert.ok(failureIndex > authIndex, "authentication result must be checked");
  assert.ok(failureIndex < parseIndex, "authentication failures must return before payload parsing");
});
