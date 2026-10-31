import test from "node:test";
import assert from "node:assert/strict";
import { novaCodeApiOptions, withNovaCodeCors } from "../frontend/lib/nova-code-api-cors.js";

const allowedOrigin = "https://voom-studio-ai.base44.app";

test("NOVA CODE API accepts preflight only for the exact Base44 origin", () => {
  const allowed = novaCodeApiOptions(new Request("https://nova.example/api/code/agents", {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin },
  }), ["GET", "OPTIONS"]);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.match(allowed.headers.get("Access-Control-Allow-Methods"), /GET/);

  const denied = novaCodeApiOptions(new Request("https://nova.example/api/code/agents", {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example" },
  }), ["GET", "OPTIONS"]);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("NOVA CODE API does not enable credentialed CORS", () => {
  const response = withNovaCodeCors(
    new Request("https://nova.example/api/code/skills", { headers: { Origin: allowedOrigin } }),
    new Response("{}", { headers: { "Content-Type": "application/json" } }),
  );
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  assert.match(response.headers.get("Vary"), /Origin/);
});
