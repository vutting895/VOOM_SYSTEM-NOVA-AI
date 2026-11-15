import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../frontend/app/api/market/analyze/route.js", import.meta.url), "utf8");
const handler = route.slice(route.indexOf("export async function POST(request)"));

test("market analysis API authenticates before reading or parsing payload", () => {
  const auth = handler.indexOf("const auth = await authenticate(request);");
  const read = handler.indexOf("raw = await request.text();");
  const parse = handler.indexOf("body = JSON.parse(raw);");
  assert.ok(auth >= 0 && read >= 0 && parse >= 0);
  assert.ok(auth < read);
  assert.ok(auth < parse);
});

test("market analysis API forwards only the authenticated user's bearer token to the fixed AI Worker", () => {
  assert.match(route, /const workerBase = \(process\.env\.NOVA_AI_API_URL \|\| 'https:\/\/voom-system-nova-ai\.suwapat787\.workers\.dev'\)/);
  assert.match(handler, /Authorization: 'Bearer ' \+ auth\.token/);
  assert.match(handler, /redirect: 'error'/);
  assert.match(handler, /signal: AbortSignal\.timeout\(15000\)/);
  assert.doesNotMatch(handler, /new URL\(body\./);
});

test("market analysis API rejects unverified, environment-ambiguous or execution-enabled responses", () => {
  assert.match(handler, /payload\?\.source\?\.dataVerified !== true/);
  assert.match(handler, /!\['demo', 'live'\]\.includes\(payload\?\.source\?\.environment\)/);
  assert.match(handler, /payload\.executionEnabled !== false/);
  assert.match(handler, /payload\.ordersEnabled !== false/);
  assert.match(handler, /payload\.liveTradingEnabled !== false/);
  assert.match(handler, /payload\?\.analysis\?\.currentBarExcluded !== true/);
  assert.match(handler, /payload\?\.analysis\?\.smc\?\.ordersSubmitted !== false/);
});
