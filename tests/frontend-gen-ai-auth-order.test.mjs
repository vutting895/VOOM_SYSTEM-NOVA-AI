import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(
  new URL("../frontend/app/api/gen-ai/generate/route.js", import.meta.url),
  "utf8",
);
const postHandler = routeSource.slice(routeSource.indexOf("export async function POST(request)"));

test("AI API authenticates before parsing request JSON", () => {
  const authIndex = postHandler.indexOf("const auth = await authenticateRequest(request);");
  const parseIndex = postHandler.indexOf("body = await request.json();");
  assert.notEqual(authIndex, -1, "POST handler must authenticate");
  assert.notEqual(parseIndex, -1, "POST handler must parse JSON after auth");
  assert.ok(authIndex < parseIndex, "authentication must precede JSON parsing");
});

test("AI API authenticates before validating the prompt and other fields", () => {
  const authIndex = postHandler.indexOf("const auth = await authenticateRequest(request);");
  const promptValidationIndex = postHandler.indexOf("if (!prompt)");
  const timeframeValidationIndex = postHandler.indexOf("if (!['5m', '15m', '1h', '4h', '1d'].includes(timeframe))");
  const riskValidationIndex = postHandler.indexOf("if (!['low', 'medium', 'high'].includes(risk))");
  assert.ok(authIndex < promptValidationIndex, "authentication must precede prompt validation");
  assert.ok(authIndex < timeframeValidationIndex, "authentication must precede timeframe validation");
  assert.ok(authIndex < riskValidationIndex, "authentication must precede risk validation");
});

test("AI API returns the authentication status with no-store headers before payload processing", () => {
  const authIndex = postHandler.indexOf("const auth = await authenticateRequest(request);");
  const failureIndex = postHandler.indexOf("if (!auth.ok)", authIndex);
  const responseIndex = postHandler.indexOf("headers: { 'Cache-Control': 'no-store' }", failureIndex);
  const parseIndex = postHandler.indexOf("body = await request.json();");
  assert.ok(failureIndex > authIndex, "auth result must be checked");
  assert.ok(responseIndex > failureIndex, "auth failures must use no-store response headers");
  assert.ok(responseIndex < parseIndex, "auth failure response must happen before body parsing");
});


test("Gen AI strategy page labels Google Gemini as a model provider", async () => {
  const pageSource = await (await import("node:fs/promises")).readFile(
    new URL("../frontend/app/gen-ai/page.jsx", import.meta.url),
    "utf8",
  );
  assert.ok(pageSource.includes("data.llm?.provider === 'gemini' ? 'Google Gemini'"));
  assert.ok(pageSource.includes("data.llm?.provider === 'cloudflare-workers-ai' ? 'Cloudflare Workers AI'"));
  assert.ok(pageSource.includes("Rule-based fallback"));
});
