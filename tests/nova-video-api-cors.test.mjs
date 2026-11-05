import test from "node:test";
import assert from "node:assert/strict";

process.env.NOVA_VIDEO_ALLOWED_ORIGINS = "https://client.example,https://preview.client.example";

const { videoApiOptions, withVideoCors } = await import("../frontend/lib/video-api-cors.js?cors-contract-test");

test("video API accepts preflight only from exact allowlisted origins", () => {
  const allowed = videoApiOptions(new Request("https://api.example/api/video/jobs", {
    method: "OPTIONS",
    headers: { Origin: "https://client.example" },
  }), ["GET", "POST", "OPTIONS"]);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://client.example");
  assert.match(allowed.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.match(allowed.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.match(allowed.headers.get("Vary"), /Origin/);

  const denied = videoApiOptions(new Request("https://api.example/api/video/jobs", {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example" },
  }), ["GET", "POST", "OPTIONS"]);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("video API responses add CORS only for allowlisted origins and never enable cookies", () => {
  const allowed = withVideoCors(
    new Request("https://api.example/api/video/jobs", { headers: { Origin: "https://client.example" } }),
    Response.json({ ok: true }),
  );
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://client.example");
  assert.equal(allowed.headers.get("Access-Control-Allow-Credentials"), null);

  const denied = withVideoCors(
    new Request("https://api.example/api/video/jobs", { headers: { Origin: "https://attacker.example" } }),
    Response.json({ ok: true }),
  );
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  assert.match(denied.headers.get("Vary"), /Origin/);
});
