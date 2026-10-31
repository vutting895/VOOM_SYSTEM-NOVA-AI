import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readBoundedRequestBody } from "../frontend/app/api/workflows/bounded-body.js";

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
  const bodyRead = proxyPost.indexOf("const boundedBody = await readBoundedRequestBody(request);");
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
  assert.match(proxyPost, /readBoundedRequestBody\(request\)/);
  assert.doesNotMatch(proxyPost, /request\.text\(\)/);
});

test("workflow proxy forwards only the verified bearer session to fixed Worker paths", () => {
  assert.match(proxyPost, /Authorization: request\.headers\.get\('authorization'\) \|\| ''/);
  assert.match(proxyPost, /fetch\(workerUrl/);
  assert.match(proxySource, /base\.protocol !== 'https:'/);
  assert.match(proxySource, /base\.username \|\| base\.password \|\| base\.search \|\| base\.hash/);
  assert.match(proxyPost, /const workerUrl = buildWorkerUrl\(path\)/);
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

test("bounded body reader rejects oversized declared Content-Length before reading", async () => {
  const request = {
    headers: new Headers({ "content-length": "16385" }),
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("x")); },
    }),
  };
  const result = await readBoundedRequestBody(request, 16384);
  assert.deepEqual(result, { ok: false, status: 413, error: "request_too_large" });
});

test("bounded body reader rejects malformed Content-Length", async () => {
  const request = {
    headers: new Headers({ "content-length": "not-a-number" }),
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("x")); },
    }),
  };
  const result = await readBoundedRequestBody(request, 16384);
  assert.deepEqual(result, { ok: false, status: 400, error: "invalid_content_length" });
});

test("bounded body reader enforces the cap while streaming when Content-Length is absent", async () => {
  let cancelled = false;
  const request = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.enqueue(new Uint8Array(7));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() { cancelled = true; },
    }),
  };
  const result = await readBoundedRequestBody(request, 16);
  assert.deepEqual(result, { ok: false, status: 413, error: "request_too_large" });
  assert.equal(cancelled, true);
});

test("bounded body reader accepts exactly the configured byte limit", async () => {
  const request = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234"));
        controller.enqueue(new TextEncoder().encode("5678"));
        controller.close();
      },
    }),
  };
  const result = await readBoundedRequestBody(request, 8);
  assert.deepEqual(result, { ok: true, raw: "12345678" });
});
