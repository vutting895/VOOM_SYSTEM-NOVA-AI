import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(
  new URL("../frontend/app/api/chat/route.js", import.meta.url),
  "utf8",
);
const postHandler = routeSource.slice(routeSource.indexOf("export async function POST(request)"));

test("chat API authenticates before reading or parsing the request body", () => {
  const authIndex = postHandler.indexOf("const auth = await authenticate(request);");
  const bodyReadIndex = postHandler.indexOf("raw = await request.text();");
  const jsonParseIndex = postHandler.indexOf("body = JSON.parse(raw);");
  assert.notEqual(authIndex, -1, "POST handler must authenticate");
  assert.notEqual(bodyReadIndex, -1, "POST handler must read request only after auth");
  assert.notEqual(jsonParseIndex, -1, "POST handler must parse JSON");
  assert.ok(authIndex < bodyReadIndex, "authentication must precede body reading");
  assert.ok(authIndex < jsonParseIndex, "authentication must precede JSON parsing");
});

test("chat API returns authentication failures before validating malformed payloads", () => {
  const authIndex = postHandler.indexOf("const auth = await authenticate(request);");
  const failureIndex = postHandler.indexOf("if (!auth.ok)", authIndex);
  const bodyReadIndex = postHandler.indexOf("raw = await request.text();");
  assert.ok(failureIndex > authIndex, "auth result must be checked");
  assert.ok(failureIndex < bodyReadIndex, "auth failure must return before body processing");
  assert.match(postHandler.slice(failureIndex, bodyReadIndex), /auth\.status/);
});
