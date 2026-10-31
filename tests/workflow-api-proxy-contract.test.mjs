import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proxySource = await readFile(
  new URL("../frontend/app/api/workflows/route.js", import.meta.url),
  "utf8",
);
const proxyPost = proxySource.slice(proxySource.indexOf("export async function POST(request)"));
const studioSource = await readFile(
  new URL("../frontend/app/flows/page.jsx", import.meta.url),
  "utf8",
);
const navSource = await readFile(
  new URL("../frontend/components/nova-navigation.jsx", import.meta.url),
  "utf8",
);

test("workflow proxy authenticates before reading or parsing request content", () => {
  const auth = proxyPost.indexOf("const auth = await authenticateRequest(request);");
  const bodyRead = proxyPost.indexOf("raw = await request.text();");
  const parse = proxyPost.indexOf("body = JSON.parse(raw);");
  const authFailure = proxyPost.indexOf("if (!auth.ok)", auth);
  assert.notEqual(auth, -1);
  assert.notEqual(bodyRead, -1);
  assert.notEqual(parse, -1);
  assert.ok(auth < authFailure && authFailure < bodyRead && bodyRead < parse);
  assert.match(proxyPost.slice(authFailure, bodyRead), /auth\.status/);
});

test("workflow proxy accepts only explicit draft and simulator operations", () => {
  assert.match(proxyPost, /exactKeys\(body, \['operation', 'prompt'\]\)/);
  assert.match(proxyPost, /path = '\/api\/workflows\/draft'/);
  assert.match(proxyPost, /exactKeys\(body, \['operation', 'draft', 'sampleData'\]\)/);
  assert.match(proxyPost, /path = '\/api\/workflows\/simulate'/);
  assert.match(proxyPost, /unsupported_workflow_operation/);
  assert.match(proxySource, /MAX_BODY_BYTES = 16 \* 1024/);
});

test("workflow proxy forwards only the verified bearer session to fixed Worker paths", () => {
  assert.match(proxyPost, /Authorization: request\.headers\.get\('authorization'\) \|\| ''/);
  assert.match(proxyPost, /fetch\(aiWorkerBase \+ path/);
  assert.match(proxyPost, /redirect: 'error'/);
  assert.match(proxyPost, /cache: 'no-store'/);
  assert.match(proxyPost, /AbortSignal\.timeout\(20000\)/);
  assert.doesNotMatch(proxyPost, /body\.url|body\.endpoint|body\.workerUrl/);
});

test("Flow Studio requires a session and uses only the draft and simulate operations", () => {
  assert.match(studioSource, /getSupabaseBrowserClient/);
  assert.match(studioSource, /supabase\.auth\.getSession\(\)/);
  assert.match(studioSource, /supabase\.auth\.onAuthStateChange/);
  assert.match(studioSource, /operation: 'draft'/);
  assert.match(studioSource, /operation: 'simulate'/);
  assert.match(studioSource, /\/api\/workflows/);
  assert.match(studioSource, /executionEnabled|EXECUTION OFF/);
  assert.match(studioSource, /persistenceEnabled|PERSISTENCE OFF/);
  assert.match(studioSource, /LIVE TRADING/);
  assert.doesNotMatch(studioSource, /operation: '(?:save|publish|execute)'/);
});

test("Flow Studio is reachable through the existing NOVA navigation", () => {
  assert.match(navSource, /label: 'Flow Studio', href: '\/flows'/);
});
